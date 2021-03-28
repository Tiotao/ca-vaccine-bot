const { Telegraf } = require("telegraf");
const config = require("./config");
const cron = require("node-cron");
const express = require('express');
const expressApp = express();
const TelegrafChatbase = require('telegraf-chatbase');
const {decrypt } = require('./crypto');
const {
    getUserId,
    fetchAppointments,
    filterAppointments,
    formatUserConfig,
    ZIPCODES,
    trackHandledEvent,
    trackUnhandledEvent,
    } = require('./utils');
const db = require("./db");

const chatbase = new TelegrafChatbase.default({
    token: config.CHATBASE_TOKEN,
})
const bot = new Telegraf(config.BOT_KEY);
bot.use(chatbase.middleware())

async function subscribeToUpdates(ctx) {
    trackHandledEvent(ctx, 'user-subscribe');
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);

    if (user) {
        if (user.active) {
            ctx.replyWithMarkdown(`Already subscribed.\n${formatUserConfig(user)}`);
        } else {
            await db.setSubscription(userId, /* active= */true);
            trackHandledEvent(ctx, 'user-subscribe-success-resubscribe');
            ctx.replyWithMarkdown(`Subscribe successfully.\n${formatUserConfig(user)}`);
        }
    } else {
        await db.addSubscriber(
            userId, 
            config.DEFAULT_RANGE_MI, 
            config.DEFAULT_ZIPCODE, 
            /* active= */ true);
        const subscriber = await db.getUser(userId);
        ctx.replyWithMarkdown(`Subscribe successfully.\n${formatUserConfig(subscriber)}`);
        trackHandledEvent(ctx, 'user-new');
        trackHandledEvent(ctx, 'user-subscribe-success-new');
    }
}

async function unsubscribeUpdates(ctx) {
    trackHandledEvent(ctx, 'user-unsubscribe');
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    if (user && user.active) {
        await db.setSubscription(userId, /* active= */false);
        trackHandledEvent(ctx, 'user-unsubscribe-success');
        ctx.replyWithMarkdown("Unsubscribed.");
    } else {
        ctx.replyWithMarkdown("You never subscribe.");
    }
    
}

async function setRange(ctx) {
    trackHandledEvent(ctx, 'update-range');
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const inputRange = parseInt(escape(ctx.message.text.split(" ")[1]));
    
    if (!inputRange) {
        trackHandledEvent(ctx, 'update-range-invalid-range');
        ctx.replyWithMarkdown(`No range specified. Please enter range between 0 and 1999 miles. e.g. \`/range 120\``);
        return;
    }

    const isInputRangeValid = inputRange > 0 && inputRange < 1999;
    if (!isInputRangeValid) {
        trackHandledEvent(ctx, 'update-range-invalid-range');
        ctx.replyWithMarkdown(`You entered an invalid range. Please enter range between 0 and 1999 miles. e.g. \`/range 120\``);
        return;
    }

    const range = isInputRangeValid ? inputRange : config.DEFAULT_RANGE_MI;

    if (user) {
        await db.setRange(userId, range);
    } else {
        await db.addSubscriber(userId, range);
        trackHandledEvent(ctx, 'user-new');
    }

    ctx.replyWithMarkdown(`Range set to ${range} Mi`);
    trackHandledEvent(ctx, 'update-range-success');
}

async function setZipcode(ctx) {
    trackHandledEvent(ctx, 'zipcode-update');
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const inputZipcode = ctx.message.text.split(" ")[1];
    
    if (!inputZipcode) {
        trackHandledEvent(ctx, 'zipcode-update-invalid');
        ctx.replyWithMarkdown(`No zipcode provided. To set your preferred zipcode, please include the zipcode after the command. e.g. \`/zipcode 94124\``);
        return;
    }
    const zipcode = escape(inputZipcode);
    const isZipcodeValid = zipcode in ZIPCODES;
    if (!isZipcodeValid) {
        trackHandledEvent(ctx, 'zipcode-update-invalid');
        ctx.replyWithMarkdown(`Invalid zipcode: ${zipcode}.`);
        return;
    }

    if (user) {
        await db.setZipcode(userId, zipcode);
    } else {
        await db.addSubscriber(userId, config.DEFAULT_RANGE_MI, zipcode, /* active= */false);
        trackHandledEvent(ctx, 'user-new');
    }
    
    ctx.replyWithMarkdown(`Zipcode set to ${zipcode}`);
    trackHandledEvent(ctx, 'zipcode-update-success');
}

async function updateNow(ctx) {
    trackHandledEvent(ctx, 'fetch-update-now');
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const appointments = await fetchAppointments();
    const results = filterAppointments(
        appointments,
        user ? parseInt(user.range) : config.DEFAULT_RANGE_MI,
        user ? user.zipcode : config.DEFAULT_ZIPCODE
    );
    
    ctx.replyWithMarkdown(results);
    trackHandledEvent(ctx, 'fetch-update-now-success');
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
        // Avoid hitting QPS limit for Telegram bot. (30 messages per second)
        await new Promise(resolve => setTimeout(resolve, 100));
        const results = filterAppointments(
            appointments,
            parseInt(decrypt(subscriber.range)),
            decrypt(subscriber.zipcode)
        );
        sendUpdate(subscriber.id, results);
    }
}

async function sendHelp(ctx, onStart) {
    trackHandledEvent(ctx, onStart? 'onboarding' : 'get-help');
    const helpText = `\u{2764} I can help you find vaccine appointments near you.\n\nYou can control me by sending these commands:\n\n/subscribe - subscribe to hourly updates based on your zipcode and search range.\n/unsubscribe - unsubscribe hourly updates.\n/range - set the search reange. (e.g.  \`/range 200\` sets the max search range to 200 miles.)\n/zipcode - set where you want to find vaccine appoinments (e.g. \`/zipcode 94124\` makes me search available appointments near 94124)\n/deleteme - remove your preference data completely.\n/help - see available commands\n\nWe are powered by VaccineSpotter API(www.vaccinespotter.org).`;
    ctx.replyWithMarkdown(helpText);
    trackHandledEvent(ctx, onStart? 'onboarding-success' : 'get-help-success');
}


async function getStats(ctx) {
    trackHandledEvent(ctx, 'get-stats');
    const count = await db.getStats();
    const countText = `${count} users are using me to find their vaccine appointments!`;
    ctx.replyWithMarkdown(countText);
    trackHandledEvent(ctx, 'get-stats-success');
}

async function deleteMe(ctx) {
    trackHandledEvent(ctx, 'user-delete');
    await db.deleteUser(userId);
    const deleteText = `Your data has been deleted.`;
    ctx.replyWithMarkdown(deleteText);
    trackHandledEvent(ctx, 'user-delete-success');
}

async function unknownCommand(ctx) {
    ctx.replyWithMarkdown(`Sorry I don't understand. Try /help.`);
    trackUnhandledEvent(ctx, 'unknown-message');
}

bot.start(async (ctx) => {
    await sendHelp(ctx, /* onStart= */true);
});
bot.command("subscribe", subscribeToUpdates);
bot.command("unsubscribe", unsubscribeUpdates);
bot.command("range", setRange);
bot.command("zipcode", setZipcode);
bot.command("now", updateNow);
bot.command("help", async (ctx) => {
    await sendHelp(ctx);
});
bot.command("stats", getStats);
bot.command("deleteme", deleteMe);

bot.on('message', unknownCommand);

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


