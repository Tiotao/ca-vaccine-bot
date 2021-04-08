const db = require("../db");
const {
    getUserId,
    formatUserConfig,
    trackHandledEvent,
} = require('../utils');
const config = require('../config');

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


module.exports = {
    subscribeToUpdates,
    unsubscribeUpdates,
};