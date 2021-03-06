const tmi = require('tmi.js');
const fs = require('fs');
const store = require('./store.js');

const tokenFile = 'token';
const config = JSON.parse(fs.readFileSync('config.json'));
const client = new tmi.client(buildClientOpts());
const questions = JSON.parse(fs.readFileSync('questions.json'));

var currentQuestion = {};
var currentTimeout = undefined;

setup();

function buildClientOpts() {
  var token = fs.readFileSync(tokenFile) + "";
  return {
    "channels": [
      config.channelName
    ],
    "identity": {
      "username": config.identity.username,
      "password": token
    }
  };
}

function setup() {
  client.on('chat', onMessageHandler);
  client.on('connected', onConnectedHandler);
  client.connect();

  console.log("All available questions:\n" + JSON.stringify(questions, null, " "));

  setInterval(ask, config.postQuestionIntervalInSeconds * 1000);
}

function ask() {
  currentQuestion = questions[Math.floor(Math.random() * questions.length)];

  var message = currentQuestion.question + " (Rate mit: " + config.answerPrefix
    + "<Antwort>) DEBUG: Try command: #score #totalScore #reset";

  client.say(config.channelName, message);
  console.log("Quiz question asked: " + message);
  console.log("Possible answers: " + JSON.stringify(currentQuestion.answers));
  return;
  // The timeout does not work currently as it is not really sync.
  if (config.questionTimeoutInSeconds > 0) {
    console.log("Question will timeout in " + config.questionTimeoutInSeconds + " seconds");
    currentTimeout = setTimeout(timeoutQuestion, config.questionTimeoutInSeconds * 1000);
  } else {
    console.log("Question timeout disabled");
  }
}

function timeoutQuestion() {
  resetTimeout();
  currentQuestion = {};
  console.log("Question timed out. Resetting it");
  client.say(config.channelName, "Tja, leider zu lang gebraucht. Viel Glück bei der nächsten Frage");
}

function resetTimeout() {
  return; // todo
  if (currentTimeout !== undefined) {
    clearTimeout(currentTimeout);
  }
}

function resolveSpecialCommands(channel, user, message) {
  var coms = config.commands;
  if (coms.personalScore === message) {
    store.readForUser(user, function(data) {
      client.say(channel, user + " deine gesamte Punktzahl ist " + data);
    });
    return true;
  } else if (coms.allScores === message) {
    store.readAll(function(data) {
      _sendMultilineScores(channel, data);
    });
    return true;
  } else if (coms.reset === message) {
    store.resetStore(function(data) { // TODO readAndReset
      client.say(channel, "Alle Punktzahlen werden zurückgesetzt. Hier der Punktstand bis hierhin:");
      _sendMultilineScores(channel, data);
    });
    return true;
  }
  return false;
}

function _sendMultilineScores(channel, data) {
  if (Object.keys(data).length === 0) {
    client.say(channel, "Bisher hat niemand Punkte gesammelt");
  }
  for (const [key, value] of Object.entries(data)) {
    client.say(channel, key + " Punkte: " + value.score);
  }
}

function onMessageHandler (target, context, message, self) {
  if (self) { return; }

  var chatSender = context['display-name'];
  if (resolveSpecialCommands(target, chatSender, message.trim())) {
    // Message was a special command and not an answer
    return;
  }

  if (!message.startsWith(config.answerPrefix)) { return; }

  if (Object.keys(currentQuestion).length === 0 || currentQuestion.answers === null) {
    client.say(target, "Tut mir leid " + chatSender + ". Aktuell ist leider keine Frage offen =(");
    return;
  }

  // Remove whitespaces from chat message
  var answer = message.replace(/\s/g, '');
  answer = answer.substr(config.answerPrefix.length);

  if (currentQuestion.answers.includes(answer)) {
    client.say(target, "Sehr gut " + chatSender + ", richtige Anwort!");
    store.incrementStore(chatSender);
    resetTimeout();
    currentQuestion = {};
  } else {
    client.say(target, "Leider falsch " + chatSender + ". Versuch es nochmal");
  }
}

function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
}