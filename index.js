const { Telegraf } = require("telegraf");
const config = require("./config");
const cron = require("node-cron");
const express = require('express');
const expressApp = express();

const {decrypt } = require('./crypto');
const {
    getUserId,
    fetchAppointments,
    filterAppointments,
    formatUserConfig,
    ZIPCODES
    } = require('./utils');
const db = require("./db");

const bot = new Telegraf(config.BOT_KEY);

async function subscribeToUpdates(ctx) {
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);

    if (user) {
        if (user.active) {
            ctx.replyWithMarkdown(`Already subscribed.\n${formatUserConfig(user)}`);
        } else {
            await db.setSubscription(userId, /* active= */true);
            ctx.replyWithMarkdown(`Subscribe successfully.\n${formatUserConfig(user)}`);
        }
    } else {
        await db.addSubscriber(userId);
        const subscriber = await db.getUser(userId);
        ctx.replyWithMarkdown(`Subscribe successfully.\n${formatUserConfig(subscriber)}`);
    }
}

async function unsubscribeUpdates(ctx) {
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);

    if (user && user.active) {
        await db.setSubscription(userId, /* active= */false);
        ctx.replyWithMarkdown("Unsubscribed.");
    } else {
        ctx.replyWithMarkdown("You never subscribe.");
    }
}

async function setRange(ctx) {
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const inputRange = parseInt(escape(ctx.message.text.split(" ")[1]));
    
    if (!inputRange) {
        ctx.replyWithMarkdown(`No range specified. Please enter range between 0 and 1999 miles. e.g. \`/range 120\``);
        return;
    }

    const isInputRangeValid = inputRange > 0 && inputRange < 1999;
    if (!isInputRangeValid) {
        ctx.replyWithMarkdown(`You entered an invalid range. Please enter range between 0 and 1999 miles. e.g. \`/range 120\``);
        return;
    }

    const range = isInputRangeValid ? inputRange : config.DEFAULT_RANGE_MI;

    if (user) {
        await db.setRange(userId, range);
    } else {
        await db.addSubscriber(userId, range);
    }

    ctx.replyWithMarkdown(`Range set to ${range} Mi`);
}

async function setZipcode(ctx) {
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const inputZipcode = ctx.message.text.split(" ")[1];
    
    if (!inputZipcode) {
        ctx.replyWithMarkdown(`No zipcode provided. To set your preferred zipcode, please include the zipcode after the command. e.g. \`/zipcode 94124\``);
        return;
    }
    const zipcode = escape(inputZipcode);
    const isZipcodeValid = zipcode in ZIPCODES;
    if (!isZipcodeValid) {
        ctx.replyWithMarkdown(`Invalid zipcode: ${zipcode}.`);
        return;
    }

    if (user) {
        await db.setZipcode(userId, zipcode);
    } else {
        await db.addSubscriber(userId, config.DEFAULT_RANGE_MI, zipcode);
    }

    ctx.replyWithMarkdown(`Zipcode set to ${zipcode}`);
}

async function updateNow(ctx) {
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const appointments = await fetchAppointments();
    const results = filterAppointments(
        appointments,
        user ? parseInt(user.range) : config.DEFAULT_RANGE_MI,
        user ? user.zipcode : config.DEFAULT_ZIPCODE
    );
    sendUpdate(userId, results);
}

function sendUpdate(userId, results) {
    bot.telegram
        .sendMessage(userId, results, {
            parse_mode: "Markdown",
        })
        .catch(() => {
            db.setSubscription(userId, /* active= */false);
        });
}

async function broadcastUpdate() {
    const subscribers = await db.getAllSubscribers();
    const appointments = await fetchAppointments();
    console.info(`fetched total: ${appointments.length}`);
    console.info(`user total: ${subscribers.length}`);
    for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];
        const results = filterAppointments(
            appointments,
            parseInt(decrypt(subscriber.range)),
            decrypt(subscriber.zipcode)
        );
        sendUpdate(subscriber.id, results);
    }
}

async function sendHelp(ctx) {
    const helpText = `\u{2764} I can help you find vaccine appointments near you.\n\nYou can control me by sending these commands:\n\n/subscribe - subscribe to hourly updates based on your zipcode and search range.\n/unsubscribe - unsubscribe hourly updates.\n/range - set the search reange. (e.g.  \`/range 200\` sets the max search range to 200 miles.)\n/zipcode - set where you want to find vaccine appoinments (e.g. \`/zipcode 94124\` makes me search available appointments near 94124)\n/deleteme - remove your preference data completely.\n/help - see available commands\n\nWe are powered by VaccineSpotter API(www.vaccinespotter.org).`;
    const userId = getUserId(ctx);
    sendUpdate(userId, helpText);
}

async function getStats(ctx) {
    const userId = getUserId(ctx);
    const count = await db.getStats();
    const countText = `${count} users are using me to find their vaccine appointments!`;
    sendUpdate(userId, countText);
}

async function deleteMe(ctx) {
    const userId = getUserId(ctx);
    await db.deleteUser(userId);
    const countText = `Your data has been deleted.`;
    sendUpdate(userId, countText);
}

bot.start(subscribeToUpdates);
bot.command("subscribe", subscribeToUpdates);
bot.command("unsubscribe", unsubscribeUpdates);
bot.command("range", setRange);
bot.command("zipcode", setZipcode);
bot.command("now", updateNow);
bot.command("help", sendHelp);
bot.command("stats", getStats);
bot.command("deleteme", deleteMe);

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


