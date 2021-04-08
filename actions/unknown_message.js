const {
    trackUnhandledEvent,
} = require('../utils');

async function handleUnknownMessage(ctx) {
    ctx.replyWithMarkdown(`Sorry I don't understand. Try /help.`);
    trackUnhandledEvent(ctx, 'unknown-message');
}

module.exports = {
    handleUnknownMessage,
}