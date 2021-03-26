const { Telegraf } = require("telegraf");
const config = require("./config");
const cron = require("node-cron");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const adapter = new FileSync(config.DB_PATH);
const db = low(adapter);

const { encrypt, decrypt } = require('./crypto');
const {
    getUserId,
    getSubscriber,
    fetchAppointments,
    filterAppointments,
    ZIPCODES
    } = require('./utils');

db.defaults({ subscribers: [] }).write();
const bot = new Telegraf(config.BOT_KEY);

async function subscribeToUpdates(ctx) {
    const userId = getUserId(ctx);
    const subscriber = getSubscriber(db, userId);

    if (subscriber) {
        if (subscriber.active) {
            ctx.replyWithMarkdown("Already subscribed.");
        } else {
            db.get("subscribers")
                .find({ id: userId })
                .assign({ active: true })
                .write();
            ctx.replyWithMarkdown("Subscribe successfully.");
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
        ctx.replyWithMarkdown("Subscribe successfully.");
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
    const range = inputRange ? inputRange : config.DEFAULT_RANGE_MI;

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


bot.start(subscribeToUpdates);
bot.command("subscribe", subscribeToUpdates);
bot.command("unsubscribe", unsubscribeUpdates);
bot.command("range", setRange);
bot.command("zipcode", setZipcode);
bot.command("now", updateNow);
bot.launch();

cron.schedule(config.FETCH_FREQUENCY, broadcastUpdate);
