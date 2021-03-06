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

const bot = new TelegramBot(private.bot, {
    polling: false
});

const problems = JSON.parse(fs.readFileSync('./new_problems.json').toString()).problems;
let users = JSON.parse(fs.readFileSync('./users.json').toString());

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

function log(user, text) {
    console.log(`>>> ${user.first_name}(${Object.keys(users).filter(id=>id==user.id).length?users[user.id].score:0}) > ${text}`);
}

function getPercentage(id) {
    if (~Object.keys(users[id]).indexOf('wrong') && users[id].score >= 500) {
        let wrong_answers_count = (new Set(users[id].wrong)).size;
        return 1 - standardPoints * wrong_answers_count / users[id].score;
    }
}

function createAnswersLeaderboard() {
    let res = "Right answers:\n";
    for (let rightAnswererIndex in data.right_answers) {
        let perc = Math.round(1000*getPercentage(data.right_answers[rightAnswererIndex][0]))/10 || '';
        if (perc) {
            perc = ` #${perc}%`;
        }
        rightAnswererIndex = parseInt(rightAnswererIndex);
        if (rightAnswererIndex < 3) {
            res += `<b>${(rightAnswererIndex + 1)}: ${data.right_answers[rightAnswererIndex][1]} - ${data.right_answers[rightAnswererIndex][2]}${perc}</b>\n`;
        } else
            res += `${(rightAnswererIndex + 1)}: ${data.right_answers[rightAnswererIndex][1]} - ${data.right_answers[rightAnswererIndex][2]}${perc}\n`;
    }
    if (!data.right_answers) {
        res = 'No one gave the right answer.\n';
    }
    res += "#Problem_Leaderboard";
    return res;
}

function registerUser(user, date) {
    console.log(user);
    users[user.id] = {
        first_name: user.first_name,
        username: user.username,
        joined: date,
        score: 0
    };
    fs.writeFileSync('./users.json', JSON.stringify(users));
}

async function registerUserById(id) {
    try {
        registerUser((await bot.getChatMember(private.group, id)).user);
    } catch (err) {
        console.error(err);
    }
}

function saveData() {
    fs.writeFileSync('./data.json', JSON.stringify(data));
}

function addRightAnswer(user, problemNumber, withScore = true) {
    console.log("Here");
    if (data.right_answers) {
        for (let right_answerer of data.right_answers) {
            if (right_answerer[0] == user.id) {
                console.log("interrupting");
                return;
            }
        }
    }
    if (withScore) {
        console.log("Here");
        users[user.id].score += problems[data.lastProblem].points || standardPoints;
        if (!users[user.id].right) users[user.id].right = [];
        users[user.id].right.push(problemNumber);
        console.log("Here");
        console.log(users);
        fs.writeFileSync('./users.json', JSON.stringify(users));
    }
    if (!data.right_answers) {
        data.right_answers = [];
    }
    data.right_answers.push([user.id, user.first_name, users[user.id].score]);
    saveData();
}

function addWrongAnswer(user, problemNumber, withScore = true) {
    if (withScore) {
        if (!users[user.id].wrong) users[user.id].wrong = [];
        users[user.id].wrong.push(problemNumber);
        fs.writeFileSync('./users.json', JSON.stringify(users));
    }
}

function clearLastProblem() {
    data.lastProblem = undefined;
    data.right_answers = [];
    data.lastAnswerers = [];
    saveData();
}

function checkGroupRegistration(message) {
    return message.chat && data.registered_groups.includes(message.chat.id);
}

function registerGroup(message) {
    data.registered_groups.push(message.chat.id);
    saveData();
    log(message.from, `Registered ${message.chat.title} - ${message.chat.id} by ${message.from.username}`);
}

async function onStart(message) {
    if (!checkGroupRegistration(message)) {
        if (private.superadmins.includes(message.from.username)) {
            registerGroup(message);
            if (checkIfFromAdmin(message)) {
                ticking = true;
            }
        } else {
            await bot.sendMessage(message.chat.id, "This bot is created by @KoStard and if you want to register your group and access it's facilities, then contact @KoStard or join https://t.me/Pathology_Group, where you can find multiple problems with this bot.")
            log(message.from, "Unauthorized call in " + message.chat.title);
            console.log(message);
        }
    } else {
        if (checkIfFromAdmin(message)) {
            ticking = true;
        }
    }
}

async function checkIfFromAdmin(message) {
    return !!(await bot.getChatAdministrators(message.chat.id)).filter(x => x.id == message.from.id);
}

async function onStop(message) {
    if (checkIfFromAdmin(message)) {
        ticking = false;
    }
}

async function onSend(message) {
    if (private.whitelist.includes(message.from.username)) {
        const index = parseInt(message.text.match(/^\/send\s*(\d+)/)[1]) - 1;
        if (index < problemIndexMinimum - 1 || index > problemIndexMaximum - 1) return;
        data.lastProblem = index;
        data.right_answers = [];
        data.lastAnswerers = [];
        saveData();
        if (!problems[index].special) {
            await bot.sendMessage(message.chat.id, createProblem(problems[index]), {
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
        await bot.sendMessage(message.chat.id, `Sorry dear ${message.from.first_name} you are not allowed to use this command, if you are active and think that can controll this process, then contact @KoStard`);
    }
}

async function onAnswer(message) {
    if (private.whitelist.includes(message.from.username)) {
        const index = parseInt(message.text.match(/^\/answer\s*(\d+)/)[1]) - 1;
        if (index < problemIndexMinimum - 1 || index > problemIndexMaximum - 1) return;
        answerText = createAnswer(problems[index]);
        let MAX_LENGTH = 4096;
        if (answerText.length <= MAX_LENGTH) {
            await bot.sendMessage(message.chat.id, answerText, {
                parse_mode: 'HTML'
            }).then(async function () {
                if (index == data.lastProblem) {
                    await bot.sendMessage(message.chat.id, createAnswersLeaderboard(), {
                        parse_mode: 'HTML'
                    });
                    clearLastProblem();
                }
            });
        } else {
            let answerSpl = answerText.split(". ");
            let messages = [''];
            for (let peace of answerSpl) {
                messages[messages.length - 1] += peace + '. ';
                if (messages[messages.length - 1].length > min(MAX_LENGTH, answerText.length / 2)) {
                    messages.push('');
                }
            }
            for (let messageBlock of messages) {
                await bot.sendMessage(message.chat.id, messageBlock, {
                    parse_mode: 'HTML'
                });
            }
            if (index == data.lastProblem) {
                await bot.sendMessage(message.chat.id, createAnswersLeaderboard(), {
                    parse_mode: 'HTML'
                });
                clearLastProblem();
            }
        }
    } else {
        await bot.sendMessage(message.chat.id, `Sorry dear ${message.from.first_name} you are not allowed to use this command, if you are active and think that can controll this process, then contact @KoStard`);
    }
}

function onNewChatMember(message) {
    for (let new_chat_member of message.new_chat_members) {
        if (!users[new_chat_member.id]) {
            registerUser(new_chat_member, message.date);
        }
    }
}

async function onScore(message) {
    let score = 0;
    if (users[message.from.id]) {
        score = users[message.from.id].score;
    }
    await bot.sendMessage(message.chat.id, `The score of ${message.from.first_name} is <b>${score}</b>`, {
        parse_mode: "HTML"
    });
}

async function onVariant(message) {
    let text = message.text;
    if (text.length == 2)
        text = text[1];
    const variant = text.toLowerCase();
    log(message.from, `Variant -- ${variant}`);
    if (data.lastProblem != undefined) {
        if (data.lastAnswerers && data.lastAnswerers.includes(message.from.id)) {
            return;
        }
        if (variant == problems[data.lastProblem].right_choice) {
            addRightAnswer(message.from, data.lastProblem + 1, message.withScore);
            console.log(`Right answer from ${message.from.first_name}: N${data.right_answers.length}`);
        } else {
            addWrongAnswer(message.from, data.lastProblem + 1, message.withScore);
            console.log("Wrong answer from " + message.from.first_name);
        }
        if (!data.lastAnswerers) {
            data.lastAnswerers = [];
        }
        data.lastAnswerers.push(message.from.id);
        saveData();
    } else {
        console.log("No last problem", data);
    }
}

function processMessage(message) {
    // console.log(`>>> ${message.from.first_name} -- ${message.text}`);
    log(message.from, message.text);
}

function simulateAnswering(id, text, withScore = true) {
    if (typeof (id) == "object") {
        for (let currentId of id) {
            let lastScore = users[currentId].score;
            onVariant({
                from: {
                    first_name: users[currentId].first_name,
                    id: currentId,
                },
                text: text,
                withScore: withScore
            });
            if (!withScore) {
                users[currentId].score = lastScore;
            }
        }
    } else {
        let lastScore = users[id].score;
        onVariant({
            from: {
                first_name: users[id].first_name,
                id: id,
            },
            text: text,
            withScore: withScore
        });
        if (!withScore) {
            users[id].score = lastScore;
        }
    }
}

let regs = {
    "^/start": onStart,
    "^/stop": onStop,
    "^/send": onSend,
    "^/answer": onAnswer,
    "^/score": onScore,
    "^/[a-zA-Z]$": onVariant,
    "^[a-zA-Z]$": onVariant,
    "[\\s\\S]+": processMessage
};
let ticking = true;
ticker();
async function ticker() {
    if (ticking) await tick();
    setTimeout(ticker, 700);
}
async function tick() {
    resp = await fetch(`https://api.telegram.org/bot${private.bot}/getUpdates?offset=${data.offset}`)
    if (resp.statusText == 'OK' && resp.status == 200) {
        let b = await resp.json();
        if (b.ok && b.result.length) {
            console.log("Updating");
            console.log(b);
            for (let update of b.result) {
                let message = update.message;
                console.log(message);
                if (!message) {
                    data.offset = update.update_id + 1;
                    continue;
                }
                if (!checkGroupRegistration(message)) {
                    onStart(message);
                    data.offset = update.update_id + 1;
                    continue;
                }
                if (message.text) {
                    let text = message.text.replace(/(?:^\s+|\s+$|\s{2;})/, "");
                    if (!users[message.from.id]) {
                        registerUser(message.from);
                    }
                    for (let r of Object.keys(regs)) {
                        if (text.match(new RegExp(r))) {
                            await regs[r](message);
                            break;
                        }
                    }
                } else if (message.new_chat_members) {
                    onNewChatMember(message);
                }
                data.offset = update.update_id + 1; // Will increase the offset each time
            }
        }
    }
    saveData();
}