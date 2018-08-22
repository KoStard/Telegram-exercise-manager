/* jshint esversion: 6 */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
let private;
if (fs.existsSync('./private.json')) {
    private = JSON.parse(fs.readFileSync('./private.json').toString());
} else {
    private = {};
    fs.mkdirSync("private.json");
}

const problems = JSON.parse(fs.readFileSync('./Problems.json').toString()).problems;
let users = JSON.parse(fs.readFileSync('./users.json').toString());

const bot = new TelegramBot(private.bot, { polling: true });
let data = JSON.parse(fs.readFileSync("./data.json").toString());
const standardPoints = 50;

const problemIndexMinimum = 1;
const problemIndexMaximum = 500;

function createProblem(problem) {
    let title = `<b>#Problem N${problem.index}</b>`;
    let sub = `From chapter: #${problem.chapter.replace(/\s+/, "_")}`;
    let content = problem.problem;
    let variants = problem.variants.join('\n');
    return `${title}
${sub}
${content}
${variants}`;
}

function createAnswer(problem) {
    return `<b>The right choice is ${problem.right_choice.toUpperCase()}</b>
${problem.answer}
#Answer to ${problem.index}`;
}

function createAnswersLeaderboard() {
    let res = "";
    for (let rightAnswererIndex in data.right_answers) {
        rightAnswererIndex = parseInt(rightAnswererIndex);
        if (rightAnswererIndex < 3) {
            res += `<b>${(rightAnswererIndex + 1)}: ${data.right_answers[rightAnswererIndex][1]} - ${data.right_answers[rightAnswererIndex][2]}</b>\n`;
        }else
            res += `${(rightAnswererIndex + 1)}: ${data.right_answers[rightAnswererIndex][1]} - ${data.right_answers[rightAnswererIndex][2]}\n`;
    }
    if (res == '') {
        res = 'No one gave the right answer.\n';
    }
    res += "#Problem_Leaderboard";
    return res;
}

function registerUser(user, date) {
    users[user.id] = {
        first_name: user.first_name,
        username: user.username,
        joined: date,
        score: 0
    };
    fs.writeFileSync('./users.json', JSON.stringify(users));
}

function saveData() {
    fs.writeFileSync('./data.json', JSON.stringify(data));
}

function addRightAnswer(user) {
    if (data.right_answers) {
        for (right_answerer of data.right_answers) {
            if (right_answerer[0] == user.id) {
                return;
            }
        }
    }
    users[user.id].score += problems[data.lastProblem].points || standardPoints;
    fs.writeFileSync('./users.json', JSON.stringify(users));
    if (!data.right_answers) {
        data.right_answers = [];
    }
    data.right_answers.push([user.id, user.first_name, users[user.id].score]);
    saveData();
}

function clearLastProblem() {
    data.lastProblem = undefined;
    data.right_answers = [];
    data.lastAnswerers = [];
    saveData();
}

function onSend(message) {
    if (private.whitelist.includes(message.from.username)) {
        const index = parseInt(message.text.match(/^\/send\s*(\d+)/)[1]) - 1;
        if (index < problemIndexMinimum - 1 || index > problemIndexMaximum - 1) return;
        data.lastProblem = index;
        data.right_answers = [];
        saveData();
        if (!problems[index].special) {
            bot.sendMessage(message.chat.id, createProblem(problems[index]), {
                parse_mode: 'HTML'
            }).then(async function () {
                for (let imageName of problems[index].images) {
                    await bot.sendPhoto(message.chat.id, "./Photos/" + imageName);
                }
            });
        } else {
            console.log("Special problem");
        }
    } else {
        bot.sendMessage(message.chat.id, `Sorry dear ${message.from.first_name} you are not allowed to use this command, if you are active and think that can controll this process, then contact @KoStard`);
    }
}

bot.onText(/^\/send/, (message) => {
    onSend(message);
});

function sendScore(message) {
    let score = 0;
    if (users[message.from.id]) {
        score = users[message.from.id].score;
    } else {
        registerUser(message.from);
    }
    bot.sendMessage(message.chat.id, `The score of ${message.from.first_name} is <b>${score}</b>`, {
        parse_mode: "HTML"
    });
}

bot.onText(/^\/score/, (message) => {
    sendScore(message);
});

function onAnswer(message) {
    if (private.whitelist.includes(message.from.username)) {
        const index = parseInt(message.text.match(/^\/answer\s*(\d+)/)[1]) - 1;
        if (index < problemIndexMinimum - 1 || index > problemIndexMaximum - 1) return;
        bot.sendMessage(message.chat.id, createAnswer(problems[index]), {
            parse_mode: 'HTML'
        }).then(() => {
            if (index == data.lastProblem) {
                bot.sendMessage(message.chat.id, createAnswersLeaderboard(), {
                    parse_mode: 'HTML'
                });
                clearLastProblem();
            }
        });
    } else {
        bot.sendMessage(message.chat.id, `Sorry dear ${message.from.first_name} you are not allowed to use this command, if you are active and think that can controll this process, then contact @KoStard`);
    }
}

bot.onText(/^\/answer/, (message) => {
    onAnswer(message);
});

function onNewChatMember(message) {
    for (let new_chat_member of message.new_chat_members) {
        if (!users[new_chat_member.id]) {
            registerUser(new_chat_member, message.date);
        }
    }
}

bot.on('new_chat_members', (message) => {
    onNewChatMember(message);
});

function processMessage(message) {
    if (!message.text) return;
    let text = message.text.replace(/(?:^\s+|\s+$|\s{2;})/, "");
    if (text[0] == '/')
        return;
    if (text.length == 1) {
        if (!users[message.from.id]) {
            registerUser(message.from);
        }
        const variant = text.toLowerCase();
        if (data.lastProblem != undefined) {
            if (data.lastAnswerers && data.lastAnswerers.includes(message.from.id)) {
                return;
            }
            if (variant == problems[data.lastProblem].right_choice) {
                addRightAnswer(message.from);
                console.log("Right answer from " + message.from.first_name);
            } else {
                console.log("Wrong answer from " + message.from.first_name);
            }
            if (!data.lastAnswerers) {
                data.lastAnswerers = [];
            }
            data.lastAnswerers.push(message.from.id);
            saveData();
        }
    }
}

bot.on('message', (message) => {
    processMessage(message);
});


bot.getUpdates().then((updates) => {
    console.log(updates);
    for (let update of updates) {
        let message = update.message;
        if (message) {
            let text = message.text;
            if (text.match(/^\/score/)) {
                sendScore(message);
            } else if (text.match(/^\/answer/)) {
                onAnswer(message);
            } else if (text.match(/^\/send/)) {
                onSend(message);
            } else if (message.new_chat_members) {
                onNewChatMember(message);
            } else 
                processMessage(message);
        }
    }
})