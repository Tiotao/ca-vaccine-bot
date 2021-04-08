const {
    trackHandledEvent,
} = require('../utils');

async function sendHelp(ctx, onStart) {
    const helpText = `\u{2764} I can help you find vaccine appointments near you.\n\nYou can control me by sending these commands:\n\n/subscribe - subscribe to hourly updates based on your zipcode and search range.\n/unsubscribe - unsubscribe hourly updates.\n/range - set the search range.\n/zipcode - set where you want to find vaccine appoinments.\n/deleteme - remove your preference data completely.\n/now - look for appointments now (beta).\n/help - see available commands\n\nReport bugs: uscovidvaccinebot@gmail.com \n\nWe are powered by VaccineSpotter API(www.vaccinespotter.org).`;
    ctx.replyWithMarkdown(helpText);
    trackHandledEvent(ctx, onStart ? 'onboarding' : 'get-help');
}

async function sendHelpOnStart(ctx) {
    await sendHelp(ctx, /* onStart= */true);
}

module.exports = {
    sendHelp,
    sendHelpOnStart
}