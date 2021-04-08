const {
    trackHandledEvent,
} = require('../utils');
const db = require('../db');


async function getStats(ctx) {
    const count = await db.getStats();
    const countText = `${count} users are using me to find their vaccine appointments!`;
    ctx.replyWithMarkdown(countText);
    trackHandledEvent(ctx, 'get-stats');
}

module.exports = {
    getStats,
}