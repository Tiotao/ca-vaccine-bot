const { Telegraf } = require("telegraf");
const config = require("./config");
const cron = require("node-cron");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const adapter = new FileSync(config.DB_PATH);
const db = low(adapter);
const express = require('express');
const expressApp = express();

const { encrypt, decrypt } = require('./crypto');
const {
    getUserId,
    getSubscriber,
    fetchAppointments,
    filterAppointments,
    formatUserConfig,
    ZIPCODES
    } = require('./utils');

db.defaults({ subscribers: [] }).write();
const bot = new Telegraf(config.BOT_KEY);

async function subscribeToUpdates(ctx) {
    const userId = getUserId(ctx);
    const subscriber = getSubscriber(db, userId);

    if (subscriber) {
        if (subscriber.active) {
            ctx.replyWithMarkdown(`Already subscribed.\n${formatUserConfig(subscriber)}`);
        } else {
            db.get("subscribers")
                .find({ id: userId })
                .assign({ active: true })
                .write();
            ctx.replyWithMarkdown(`Subscribe successfully.\n${formatUserConfig(subscriber)}`);
        }
    } else {
        db.get("subscribers")
            .push({
                id: userId,
                range: encrypt(config.DEFAULT_RANGE_MI.toString()),
                zipcode: encrypt(config.DEFAULT_ZIPCODE),
                active: true,
            })
            .write();
        const subscriber = getSubscriber(db, userId);
        ctx.replyWithMarkdown(`Subscribe successfully.\n${formatUserConfig(subscriber)});
    }
}

async function unsubscribeUpdates(ctx) {
    const userId = getUserId(ctx);
    const subscriber = getSubscriber(db, userId);

    if (subscriber && subscriber.active) {
        db.get("subscribers")
            .find({ id: userId })
            .assign({ active: false })
            .write();
        ctx.replyWithMarkdown("Unsubscribed.");
    } else {
        ctx.replyWithMarkdown("You never subscribe.");
    }
}

async function setRange(ctx) {
    const userId = getUserId(ctx);
    const subscriber = getSubscriber(db, userId);
    const inputRange = parseInt(ctx.message.text.split(" ")[1]);
    const isInputRangeValid = inputRange && inputRange > 0 && inputRange < 9999;
    const range = isInputRangeValid ? inputRange : config.DEFAULT_RANGE_MI;

    if (subscriber) {
        db.get("subscribers")
            .find({ id: userId })
            .assign({ range: encrypt(range.toString()) })
            .write();
    } else {
        db.get("subscribers")
            .push({
                id: userId,
                range: encrypt(range.toString()),
                zipcode: encrypt(config.DEFAULT_ZIPCODE),
                active: false,
            })
            .write();
    }
    ctx.replyWithMarkdown(`Range set to ${range} Mi`);
}

async function setZipcode(ctx) {
    const userId = getUserId(ctx);
    const subscriber = getSubscriber(db, userId);
    const zipcode = ctx.message.text.split(" ")[1];
    const isZipcodeValid = zipcode in ZIPCODES;

    if (!isZipcodeValid) {
        ctx.replyWithMarkdown(`Invalid zipcode: ${zipcode}.`);
        return;
    }

    if (subscriber) {
        db.get("subscribers")
            .find({ id: userId })
            .assign({ zipcode: encrypt(zipcode) })
            .write();
    } else {
        db.get("subscribers")
            .push({
                id: userId,
                zipcode: encrypt(zipcode),
                range: encrypt(config.DEFAULT_RANGE_MI.toString()),
                active: false,
            })
            .write();
    }
    ctx.replyWithMarkdown(`Zipcode set to ${zipcode}`);
}

async function updateNow(ctx) {
    const userId = getUserId(ctx);
    const subscriber = getSubscriber(db, userId);
    const appointments = await fetchAppointments();
    const results = filterAppointments(
        appointments,
        subscriber ? parseInt(decrypt(subscriber.range)) : config.DEFAULT_RANGE_MI,
        subscriber ? decrypt(subscriber.zipcode) : config.DEFAULT_ZIPCODE
    );
    sendUpdate(userId, results);
}

function sendUpdate(userId, results) {
    bot.telegram
        .sendMessage(userId, results, {
            parse_mode: "Markdown",
        })
        .catch(() => {
            db.get("subscribers")
                .find({ id: userId })
                .assign({ active: false })
                .write();
        });
}

async function broadcastUpdate() {
    const subscribers = db.get("subscribers").value();
    const appointments = await fetchAppointments();
    console.info(`fetched total: ${appointments.length}`);
    console.info(`user total: ${subscribers.length}`);
    for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];
        if (subscriber.active) {
            const results = filterAppointments(
                appointments,
                parseInt(decrypt(subscriber.range)),
                decrypt(subscriber.zipcode)
            );
            sendUpdate(subscriber.id, results);
        }
    }
}

async function sendHelp(ctx) {
    const helpText = `I can help you find vaccine appointments near you.\n\nYou can control me by sending these commands:\n\n/subscribe - subscribe to hourly updates based on your zipcode and search range.\n/unsubscribe - unsubscribe hourly updates.\n/range - set the search reange. (e.g.  \`/range 200\` sets the max search range to 200 miles.)\n/zipcode - set where you want to find vaccine appoinments (e.g. \`/zipcode 94124\` makes me search available appointments near 94124)\n/help - see available commands\n\nWe are powered by VaccineSpotter API(www.vaccinespotter.org).`;
    const userId = getUserId(ctx);
    sendUpdate(userId, helpText);
}

bot.start(subscribeToUpdates);
bot.command("subscribe", subscribeToUpdates);
bot.command("unsubscribe", unsubscribeUpdates);
bot.command("range", setRange);
bot.command("zipcode", setZipcode);
bot.command("now", updateNow);
bot.command("help", sendHelp);

if (config.ENV === "prod") {
    bot.telegram.setWebhook(config.WEBHOOK_URL);
    expressApp.use(bot.webhookCallback(`/webhook`));
    expressApp.get('/', (req, res) => {
        res.send('Hello World!');
    });
    expressApp.listen(config.WEBHOOK_PORT, () => {
        console.log(`Server running on port ${config.WEBHOOK_PORT}`);
    });
    cron.schedule(config.FETCH_FREQUENCY, broadcastUpdate);
} else {
    bot.launch();
    cron.schedule(config.FETCH_FREQUENCY_DEBUG, broadcastUpdate);
}


