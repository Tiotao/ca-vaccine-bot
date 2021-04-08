const {
    trackHandledEvent,
} = require('../utils');

async function sendWhatDoesTheBotSay(ctx, onStart) {
    const botSayText = `Hi Humans,\n\nI am a bot. Bots don't get COVID-19 like Humans do, but I know bots and Humans are in this together.\n\nBecause of the pandemic, many of my friends are losing their jobs. I knew a resturant reservation bot who hasn't spoken to any human since last year.\n\nYou know how lonley it is in cyber world? I am sure you do. I miss the nosiy streets of San Francisco and busy restaurants in New York City. I miss working together with my other bot friends to make your life better.\n\nI know many of you are still hesitant to get a vaccine or finding it difficult to get an appointment, that's why I am here. I am here to help because I know we are in this together. It is not about race, nationality, sexual orientation or political stands... It is about all of us, Humans and the bots.\n\nSo, do your part and get vaccinated. Hope to meet you in real life soon.\n\n- From your friendly bot, with love. `;
    ctx.replyWithMarkdown(botSayText);
    trackHandledEvent(ctx, 'botsay');
}

module.exports = {
    sendWhatDoesTheBotSay,
}