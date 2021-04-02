const { Telegraf } = require("telegraf");
const config = require("./config");
const cron = require("node-cron");
const express = require('express');
const expressApp = express();
const TelegrafChatbase = require('telegraf-chatbase');
const { decrypt } = require('./crypto');
const {
    getUserId,
    fetchAppointments,
    filterAppointments,
    formatUserConfig,
    ZIPCODES,
    trackHandledEvent,
    trackUnhandledEvent,
    fetchStateAppointments,
} = require('./utils');
const db = require("./db");
const zipcodes = require('zipcodes');

const chatbase = new TelegrafChatbase.default({
    token: config.CHATBASE_TOKEN,
})
const bot = new Telegraf(config.BOT_KEY);
bot.use(chatbase.middleware())

async function subscribeToUpdates(ctx) {
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);

    if (user) {
        if (user.active) {
            ctx.replyWithMarkdown(`Haiyaa, you subscribed already.\n${formatUserConfig(user)}`);
        } else {
            await db.setSubscription(userId, /* active= */true);
            trackHandledEvent(ctx, 'user-subscribe-success-resubscribe');
            ctx.replyWithMarkdown(`Subscribed successfully.\n${formatUserConfig(user)}`);
        }
    } else {
        await db.addSubscriber(
            userId,
            config.DEFAULT_RANGE_MI,
            config.DEFAULT_ZIPCODE,
            /* active= */ true);
        const subscriber = await db.getUser(userId);
        ctx.replyWithMarkdown(`Subscribed successfully.\n${formatUserConfig(subscriber)}`);
        trackHandledEvent(ctx, 'user-subscribe-success-new');
    }
}

async function unsubscribeUpdates(ctx) {
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
    }

    ctx.replyWithMarkdown(`Range set to ${range} mi`);
    trackHandledEvent(ctx, 'update-range-success');
}

async function setZipcode(ctx) {
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const inputZipcode = ctx.message.text.split(" ")[1];

    if (!inputZipcode) {
        trackHandledEvent(ctx, 'zipcode-update-invalid');
        ctx.replyWithMarkdown(`No zipcode provided. To set your preferred zipcode, please include the zipcode after the command. e.g. \`/zipcode 15213\``);
        return;
    }
    const zipcode = escape(inputZipcode);
    const zipcodeInfo = zipcodes.lookup(zipcode);
    const isZipcodeValid = zipcodes.lookup(zipcode) && config.VALID_STATES.includes(zipcodeInfo.state);
    if (!isZipcodeValid) {
        trackHandledEvent(ctx, 'zipcode-update-invalid');
        ctx.replyWithMarkdown(`Invalid zipcode or your zipcode is not currently supported: ${zipcode}.`);
        return;
    }

    if (user) {
        await db.setZipcode(userId, zipcode);
    } else {
        await db.addSubscriber(userId, config.DEFAULT_RANGE_MI, zipcode, /* active= */false);
    }

    ctx.replyWithMarkdown(`Zipcode set to ${zipcode}`);
    trackHandledEvent(ctx, 'zipcode-update-success');
}

async function updateNow(ctx) {
    trackHandledEvent(ctx, 'fetch-update-now');
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const zipcodeInfo = zipcodes.lookup(user.zipcode);
    const appointments = await fetchStateAppointments(zipcodeInfo.state);
    const results = filterAppointments(
        appointments,
        user ? parseInt(user.range) : config.DEFAULT_RANGE_MI,
        user ? user.zipcode : config.DEFAULT_ZIPCODE
    );

    ctx.replyWithMarkdown(results);
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
    console.info(`start broadcasting`);
    const subscribers = await db.getAllSubscribers();
    const appointments = await fetchAppointments();
    console.info(`user total: ${subscribers.length}`);
    for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];
        const range = parseInt(decrypt(subscriber.range));
        const zipcode = decrypt(subscriber.zipcode);
        const zipcodeInfo = zipcodes.lookup(zipcode);
        if (zipcodeInfo) {
            // Avoid hitting QPS limit for Telegram bot. (30 messages per second)
            await new Promise(resolve => setTimeout(resolve, 100));
            const results = filterAppointments(
                appointments[zipcodeInfo.state],
                range,
                zipcode,
            );
            sendUpdate(subscriber.id, results);
        }
    }
}

async function sendHelp(ctx, onStart) {
    const helpText = `\u{2764} I can help you find vaccine appointments near you.\n\nYou can control me by sending these commands:\n\n/subscribe - subscribe to hourly updates based on your zipcode and search range.\n/unsubscribe - unsubscribe hourly updates.\n/range - set the search reange. (e.g.  \`/range 200\` sets the max search range to 200 miles.)\n/zipcode - set where you want to find vaccine appoinments (e.g. \`/zipcode 94124\` makes me search available appointments near 94124)\n/deleteme - remove your preference data completely.\n/help - see available commands\n\nWe are powered by VaccineSpotter API(www.vaccinespotter.org).`;
    ctx.replyWithMarkdown(helpText);
    trackHandledEvent(ctx, onStart ? 'onboarding' : 'get-help');
}

async function sendWhatDoesTheBotSay(ctx, onStart) {
    const botSayText = `Hi Humans,\n\nI am a bot. Bots don't get COVID-19 like Humans do, but I know bots and Humans are in this together.\n\nBecause of the pandemic, many of my friends are losing their jobs. I knew a resturant reservation bot who hasn't spoken to any human since last year.\n\nYou know how lonley it is in cyber world? I am sure you do. I miss the nosiy streets of San Francisco and busy restaurants in New York City. I miss working together with my other bot friends to make your life better.\n\nI know many of you are still hesitant to get a vaccine or finding it difficult to get an appointment, that's why I am here. I am here to help because I know we are in this together. It is not about race, nationality, sexual orientation or political stands... It is about all of us, Humans and the bots.\n\nSo, do your part and get vaccinated. Hope to meet you in real life soon.\n\n- From your friendly bot, with love. `;
    ctx.replyWithMarkdown(botSayText);
    trackHandledEvent(ctx, 'botsay');
}


async function getStats(ctx) {
    const count = await db.getStats();
    const countText = `${count} users are using me to find their vaccine appointments!`;
    ctx.replyWithMarkdown(countText);
    trackHandledEvent(ctx, 'get-stats');
}

async function deleteMe(ctx) {
    trackHandledEvent(ctx, 'user-delete');
    const userId = getUserId(ctx);
    await db.deleteUser(userId);
    const deleteText = `Your data has been deleted.`;
    ctx.replyWithMarkdown(deleteText);
    trackHandledEvent(ctx, 'user-delete');
}

async function handleUnknownMessage(ctx) {
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
bot.command("whatdoesthebotsay", sendWhatDoesTheBotSay);


bot.on('message', handleUnknownMessage);

if (config.ENV === "prod") {
    bot.telegram.setWebhook(config.WEBHOOK_URL);
    expressApp.use(bot.webhookCallback(`/${config.BOT_KEY}_webhook`));
    expressApp.get('/', (req, res) => {
        res.send('Hello World!');
    });
    expressApp.listen(config.WEBHOOK_PORT, () => {
        console.log(`Server running on port ${config.WEBHOOK_PORT}`);
    });
    cron.schedule(config.FETCH_FREQUENCY, broadcastUpdate);
} else {
    bot.launch();
    broadcastUpdate();
    cron.schedule(config.FETCH_FREQUENCY_DEBUG, broadcastUpdate);
}


