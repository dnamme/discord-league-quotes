const { PREFIX, TOKEN } = require('./config.json');
const { version } = require('./package.json');

const CMDLIST = require('./commands.json');
var DATABASE = require('./data.json');
const LANG = require('./language.json');

const Discord = require('discord.js');
const client = new Discord.Client();

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

var SCONST = {};

var botHandler = {
    checkGuild: function(message) {
        if(message.channel.type === 'dm') console.log('dm');
        else {
            let guildkey = `${message.guild.name}${message.guild.id}`

            if(!botHandler[guildkey]) {
                // console.log(`creating new dataplaceholder [${guildkey}]`);
                botHandler[guildkey] = new BHGuild();
            }

            if(!botHandler[guildkey].hasInitialized) {
                joinVoiceChannel(message.guild.me.voice.channel).then(() => {}, () => {});
                botHandler[guildkey].hasInitialized = true;
            }
        }
    }, checkUser: function(message) {
        let userkey = message.author.id;

        let guildkey = `${message.guild.name}${message.guild.id}`;

        if(!botHandler[guildkey].users[userkey]) {
            botHandler[guildkey].users[userkey] = new BHUser();
        }
    }, flushQueueMessages: function(guildkey, userkey) {
        botHandler[guildkey].users[userkey].messages.forEach(message => {
            if(message.deletable && !message.deleted) {
                message.delete();
            }
        });
        botHandler[guildkey].users[userkey].messages = [];
    }, resetUser: function(guildkey, userkey) {
        botHandler[guildkey].users[userkey] = new BHUser();
    }
};

var EMBEDMSGS = {};

const resultsPerPage = 20;
const listLinesPerPage = 20;
const defaultDelayTime = 3;

var autodelete = {
    time: 10,
    settings: {
        commands: {
            invalidCommand: true,
            autoplay: {
                view: false,
                play: true,
                pause: true,
                clear: true,
                settimer: true,
                add: true,
                remove: true,
                invalidUse: true
            },
            clear: true,
            help: false,
            join: true,
            leave: true,
            list: {
                pageOutOfBounds: true
            },
            load: true,
            play: true,
            queue: false,
            save: false,
            select: true,
            skip: true
            /*
            autoplay: true,
            clear: true,
            help: false,
            join: {
                success: true,
                failed: true
            },
            leave: {
                success: true,
                failed: true
            },
            list: false,
            load: {
                all: false,
                listOfChampions: false,
                champion: false,
                invalidChampion: true
            },
            play: true,
            queue: false,
            save: false,
            select: true
            */
        }
    }, message: '',
    object: null
};
autodelete.message = `**(${LANG.message.autodelete.replace('%t%', autodelete.time)})**`
autodelete.object = { timeout: autodelete.time * 1000 };




class BHGuild {
    constructor() {
        this.playQueue = [];
        this.isPlaying = false;
        this.users = {};
        this.autoplay = null;

        this.currentlyPlayingMessage = null; // messageEmbed

        this.hasInitialized = false;

        this.runningInterval = null;
    }
}

class BHUser {
    constructor() {
        this.inMultipleSearchResult = false;
        this.inAutoplaySettings = false;
        this.searchResult = [];
        this.messages = [];
        this.voiceChannel = null;
        this.searchResultEmbed = null; // messageEmbed
        this.expandedSearchResult = null;
        this.fullSearchLine = null;
        this.lastPageNumber = 0;
        this.currentPageNumber = 1;
    }
}

class SoundRef {
    constructor(championKey = null, lineIndex = -1, versionIndex = 0) {
        if(!championKey || championKey == null) {
            for( ; ; ) {
                championKey = Object.keys(DATABASE.champions).genRandomItem();
                if(DATABASE.champions[championKey].lines) if(DATABASE.champions[championKey].lines.length) break;
            }
        }

        this.championKey = championKey;
        this.lineIndex = lineIndex == -1 ? DATABASE.champions[championKey].lines.genRandomIndex() : lineIndex;
        this.versionIndex = versionIndex;
    }
}

class AutoPlay {
    constructor() {
        this.isPlaying = false;
        this.list = [];
        this.commandIndex = 0;
        this.timer = 10;
        this.textChannel = null;
        this.voiceChannel = null;
        this.runningInterval = null;
        this.viewMessageEmbed = null;
    }
}





String.prototype.capitalizeFirstLetter = function() {
    return this.slice(0,1).toUpperCase() + this.slice(1);
}

String.prototype.championNameToKey = function() {
    return this.toLowerCase().replace(/ +/, '').replace(/\'/, '').replace(/\./, '');
}

String.prototype.isAChampion = function() {
    // let _string = this.championNameToKey();
    
    return SCONST[this.championNameToKey()] != null ? true : false;

    // if(SCONST[_string] != null) return true;
    // else return false;
}

Array.prototype.championNameToKey = function() {
    let _string = '';
    for(let i = 0; i < this.length; i++) _string += this[i];
    return _string.championNameToKey();
}

Array.prototype.genRandomIndex = function() {
    return Math.floor(Math.random() * this.length);
}

Array.prototype.genRandomItem = function() {
    return this[this.genRandomIndex()];
}

function randomColor() {
    return '#' + parseInt(Math.floor(Math.random() * 256).toString(16)) + parseInt(Math.floor(Math.random() * 256).toString(16)) + parseInt(Math.floor(Math.random() * 256).toString(16))
}

function progressBar(min = 0, top = 100, size = 20) {
    let fullbox = '\u2588';
    let emdash = '\u2014';

    let bracketL = '\uff3b';
    let bracketR = '\uff3d';

    let progressBarStr = `${bracketL} `;


    let numberOfFilled = Math.ceil((min / top) * size);

    for(let i = 1; i <= numberOfFilled; i++) progressBarStr += fullbox;
    for(let i = 1; i <= size - numberOfFilled; i++) progressBarStr += emdash;

    progressBarStr += ` ${bracketR}`;

    return progressBarStr;
}

function checkDeleteMessage(autodeleteEnabled, ...messages) {
    for(let i = 0; i < messages.length; i++)
        if(autodeleteEnabled && messages[i].deletable && !messages[i].deleted) messages[i].delete(autodelete.object);
}





client.once('ready', () => {
    client.user.setActivity(`sounds | ${PREFIX}play`, { type: 'PLAYING' });

    loadStoredDatabase();

    console.log(`League Quotes v${version} is up and running!`);
});

client.on('message', message => {
    if(!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).split(/ +/);
    const command = args.shift().toLowerCase();

    if(command === '') return;

    if(CMDLIST[command] == null) {
        return message.channel.send(`${LANG.commands.invalidCommand} ${autodelete.settings.commands.invalidCommand ? autodelete.message : ''}`).then(sentMessage => {
            checkDeleteMessage(autodelete.settings.commands.invalidCommand, message, sentMessage);
        });
    } else commandHandler(message, command, args);
});





function commandHandler(message, command, args) {
    try {
        args.forEach((value, index) => args[index] = value.toLowerCase());

        botHandler.checkGuild(message);
        botHandler.checkUser(message);

        let userkey = message.author.id;


        if(command === 'help') {
            if(!args.length) {
                // if(!EMBEDMSGS.helpall) {
                    EMBEDMSGS.helpall = new Discord.MessageEmbed()
                        .setColor('#fe6e00')
                        .setTitle('List of commands:')
                        .setFooter(`Do ${PREFIX}help [command] to know more about a specific command.\nWords in brackets [] are optional; some commands would work without them!`);

                    Object.keys(CMDLIST).forEach((commandName, index) => {
                        let fieldName;
                        let fieldValue;
                        CMDLIST[commandName].help.forEach(line => {
                            if(line.startsWith('%p%')) {
                                line = line.replace('%p%', `${PREFIX}`);
                                if(!fieldName) fieldName = line;
                                else {
                                    if(fieldValue == null) fieldValue = line;
                                    else fieldValue += '\n' + line;
                                }
                            }
                        });

                        if(fieldValue == null) fieldValue = '\u200b';

                        EMBEDMSGS.helpall.addField(fieldName, fieldValue, index % 2 == 0 ? true : true);
                    });
                // }

                return message.channel.send(EMBEDMSGS.helpall);
            } else {
                if(CMDLIST[args[0]] == null) return message.channel.send(`${args[0]} is not a command!`);
                else {
                    let helpmsg = '';
                    CMDLIST[args[0]].help.forEach((line, index) => helpmsg += (line.startsWith('%p%') ? `${PREFIX}${line.slice(3)}` : `- ${line}`) + (index == CMDLIST[args[0]].help.length - 1 ? '' : '\n'));
                    return message.channel.send(helpmsg);
                }
            }
        } else if(command === 'list') { // revised
            if(!EMBEDMSGS.list) EMBEDMSGS.list = { all: null, champions: {} };

            if(!args.length || args[0] === 'champion' || args[0] === 'champ') { // list
                EMBEDMSGS.list.all = new Discord.MessageEmbed()
                    .setColor('#6A0DAD')
                    .setTitle('List of Champions:')
                    .setFooter(`Do ${PREFIX}list [champion] for a full list of a champion's available lines.`);

                let listchampsmsg1 = '';
                let finishedLCM1 = false;
                let listchampsmsg2 = '';
                let finishedLCM2 = false;
                let listchampsmsg3 = '';

                Object.keys(DATABASE.champions).forEach(championKey => {
                    let newline = `${DATABASE.champions[championKey].name} (${DATABASE.champions[championKey].lines ? DATABASE.champions[championKey].lines.length : '0'} lines)`;
                    if(!finishedLCM1) {
                        if((listchampsmsg1 + newline).length >= 1023) {
                            finishedLCM1 = true;
                            listchampsmsg2 += newline;
                        } else listchampsmsg1 += `${listchampsmsg1 === '' ? '' : '\n'}${newline}`;
                    } else if(!finishedLCM2) {
                        if((listchampsmsg2 + newline).length >= 1023) {
                            finishedLCM2 = true;
                            listchampsmsg3 += newline;
                        } else listchampsmsg2 += `${listchampsmsg2 === '' ? '' : '\n'}${newline}`;
                    } else listchampsmsg3 += `${listchampsmsg3 === '' ? '' : '\n'}${newline}`;
                });
                
                if(listchampsmsg1 !== '') EMBEDMSGS.list.all.addField('\u200B', listchampsmsg1, true);
                if(listchampsmsg2 !== '') EMBEDMSGS.list.all.addField('\u200B', listchampsmsg2, true);
                if(listchampsmsg3 !== '') EMBEDMSGS.list.all.addField('\u200B', listchampsmsg3, true);

                message.channel.send(EMBEDMSGS.list.all);
            } else if(args[0]) { // list [champion] // revised
                if(args[0].isAChampion() || (args[0] + args[1]).isAChampion()) {
                    let championKey = (args[0].isAChampion() ? args[0] : (args[0] + args[1])).championNameToKey();

                    if(!EMBEDMSGS.list.champions[championKey]) EMBEDMSGS.list.champions[championKey] = {
                        lastPageNumber: Math.ceil(DATABASE.champions[championKey].lines.length / listLinesPerPage),
                        messageEmbeds: new Array(Math.ceil(DATABASE.champions[championKey].lines.length / listLinesPerPage))
                    }

                    let pageNumber = 1;
                    if(!isNaN(args[args.length - 1])) pageNumber = parseInt(args[args.length - 1]);


                    if(pageNumber < 1 || pageNumber > EMBEDMSGS.list.champions[championKey].lastPageNumber) {
                        return message.channel.send(`${LANG.commands.list.pageOutOfBounds.replace('%page%', pageNumber)} ${autodelete.settings.commands.list ? autodelete.message : ''}`).then(sentMessage => {
                            checkDeleteMessage(autodelete.settings.commands.list, message, sentMessage);
                        });
                    }


                    let minLineIndex = (pageNumber - 1) * listLinesPerPage + 1;
                    let maxLineIndex = (pageNumber * listLinesPerPage) > DATABASE.champions[championKey].lines.length ? DATABASE.champions[championKey].lines.length : (pageNumber * listLinesPerPage);
                

                    if(!EMBEDMSGS.list.champions[championKey].messageEmbeds[pageNumber]) EMBEDMSGS.list.champions[championKey].messageEmbeds[pageNumber] = new Discord.MessageEmbed()
                        .setColor('#6A0DAD')
                        .setTitle(DATABASE.champions[championKey].name)
                        .setThumbnail(`${DATABASE.urlpref}${DATABASE.champions[championKey].icon}`)
                        .setDescription(LANG.commands.list.showingPage
                            .replace('%min%', minLineIndex)
                            .replace('%max%', maxLineIndex)
                            .replace('%all%', DATABASE.champions[championKey].lines.length)
                            .replace('%page%', pageNumber)
                            .replace('%lastpage%', EMBEDMSGS.list.champions[championKey].lastPageNumber))
                        .setFooter(`Do ${PREFIX}list [champion] [page number] to view other pages.`)

                    let listlines1 = '';
                    let finishedL1 = false;
                    let listlines2 = '';
                    let finishedL2 = false;
                    let listlines3 = '';

                    for(let index = minLineIndex - 1; index <= maxLineIndex - 1; index++) {
                        let newline = DATABASE.champions[championKey].lines[index].line;
                        if(!finishedL1) {
                            if((listlines1 + newline).length >= 1023) {
                                finishedL1 = true;
                                listlines2 += newline;
                            } else listlines1 += `${listlines1 === '' ? '' : '\n'}${newline}`;
                        } else if(!finishedL2) {
                            if((listlines2 + newline).length >= 1023) {
                                finishedL2 = true;
                                listlines3 += newline;
                            } else listlines2 += `${listlines2 === '' ? '' : '\n'}${newline}`;
                        } else listlines3 += `${listlines3 === '' ? '' : '\n'}${newline}`;
                    }

                    if(listlines1 !== '') EMBEDMSGS.list.champions[championKey].messageEmbeds[pageNumber].addField('\u200B', listlines1);
                    if(listlines2 !== '') EMBEDMSGS.list.champions[championKey].messageEmbeds[pageNumber].addField('\u200B', listlines2);
                    if(listlines3 !== '') EMBEDMSGS.list.champions[championKey].messageEmbeds[pageNumber].addField('\u200B', listlines3);

                    message.channel.send(EMBEDMSGS.list.champions[championKey].messageEmbeds[pageNumber]);
                } else {
                    return message.channel.send(`${LANG.champion.invalidChampionName} ${autodelete.settings.commands.list.pageOutOfBounds ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.list.pageOutOfBounds, message, sentMessage);
                    }).catch(console.error);
                }
            }
        } else if(command === 'load') { // load from url
            if(!args.length || args[0] === 'all') { // load all // revised
                return message.channel.send(`\`\`\`${LANG.commands.load.loadingAllChampionLines.replace('%p%', progressBar()).replace('%num%', Object.keys(DATABASE.champions).length)}\`\`\``).then(sentMessage => {
                    loadAllChampionLines(sentMessage).then(finalMessage => {
                        checkDeleteMessage(autodelete.settings.commands.load, message, finalMessage);
                    }).catch(console.error);
                }).catch(console.error);
            } else if(args[0] === 'champions') { // load champions // revised
                return message.channel.send(LANG.commands.load.loadingList).then(sentMessage => {
                    loadListOfChampions().then(numberOfChampions => {
                        sentMessage.edit(`${LANG.commands.load.finishedLoadingList.replace('%num%', numberOfChampions)} ${autodelete.settings.commands.load ? autodelete.message : ''}`).then(editedMessage => {
                            checkDeleteMessage(autodelete.settings.commands.load, message, editedMessage);
                        }).catch(console.error);
                    }, () => {
                        sentMessage.edit(`${LANG.commands.load.alreadyLoadedList} ${autodelete.settings.commands.load ? autodelete.message : ''}`).then(editedMessage => {
                            checkDeleteMessage(autodelete.settings.commands.load, message, editedMessage);
                        }).catch(console.error);
                    });
                }).catch(console.error);
            } else if(args[0].isAChampion() || (args[0] + args[1]).isAChampion()) { // load [champion] // revised
                let championKey = (args[0].isAChampion() ? args[0] : (args[0] + args[1])).championNameToKey();

                return message.channel.send(LANG.commands.load.loadingChampionLines.replace('%c%', DATABASE.champions[championKey].name)).then(sentMessage => {
                    loadChampion(championKey).then(numberOfLines => {
                        sentMessage.edit(`${LANG.commands.load.finishedLoadingChampionLines.replace('%c%', DATABASE.champions[championKey].name).replace('%num%', numberOfLines)} ${autodelete.settings.commands.load ? autodelete.message : ''}`).then(editedMessage => {
                            checkDeleteMessage(autodelete.settings.commands.load, message, editedMessage);
                        }).catch(console.error);
                    }, () => {
                        sentMessage.edit(`${LANG.commands.load.alreadyLoadedChampionLines}`).then(editedMessage => {
                            checkDeleteMessage(autodelete.settings.commands.load, message, editedMessage);
                        }).catch(console.error);
                    });
                }).catch(console.error);
            } else { // load [invalidchampion] // revised
                return message.channel.send(`${LANG.champion.invalidChampionName} ${autodelete.settings.commands.load ? autodelete.message : ''}`).then(sentMessage => {
                    checkDeleteMessage(autodelete.settings.commands.load, message, sentMessage);
                }).catch(console.error);
            }
        } else if(command === 'save') { // revised
            return message.channel.send(`${LANG.commands.save.saving}`).then(sentMessage => {
                saveDatabase().then(() => {
                    sentMessage.edit(`${LANG.commands.save.finishedSaving} ${autodelete.settings.commands.save ? autodelete.message : ''}`).then(editedMessage => {
                        checkDeleteMessage(autodelete.settings.commands.save, message, editedMessage);
                    });
                }, () => {
                    sentMessage.edit(`${LANG.message.error} ${autodelete.settings.commands.save ? autodelete.message : ''}`).then(editedMessage => {
                        checkDeleteMessage(autodelete.settings.commands.save, message, editedMessage);
                    });
                });
            });
        }
        

        if(message.channel.type === 'text') {
            let guildkey = `${message.guild.name}${message.guild.id}`;
            

            if(command === 'join') { // revised
                joinVoiceChannel(message.member.voice.channel).then(() => {
                    return message.channel.send(`${LANG.bot.joinedVoiceChannel.replace('%vc%', message.member.voice.channel.name)} ${autodelete.settings.commands.join ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.join, message, sentMessage);
                    });
                }, () => {
                    return message.channel.send(`${LANG.user.notInVoiceChannel} ${autodelete.settings.commands.join ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.join, message, sentMessage);
                    });
                }).catch(console.error);
            } else if(command === 'leave') { // revised
                leaveVoiceChannel(message.guild.me.voice.channel).then(() => {
                    return message.channel.send(`${LANG.bot.leftVoiceChannel.replace('%vc%', message.guild.me.voice.channel.name)} ${autodelete.settings.commands.leave ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.leave, message, sentMessage);
                    });
                }, () => {
                    return message.channel.send(`${LANG.bot.notInVoiceChannel} ${autodelete.settings.commands.leave ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.leave, message, sentMessage);
                    });
                }).catch(console.error);
            } else if(command === 'play') return playHandler(guildkey, message, args);
            else if(command === 'select') return selectHandler(guildkey, userkey, message, message.channel, args);
            else if(command === 'clear') {
                botHandler[guildkey].playQueue = [];
                botHandler[guildkey].isPlaying = false;

                return message.channel.send(`${LANG.queue.cleared} ${autodelete.settings.commands.clear ? autodelete.message : ''}`).then(sentMessage => {
                    checkDeleteMessage(autodelete.settings.commands.clear, message, sentMessage);
                });
            } else if(command === 'queue') {
                EMBEDMSGS.queue = new Discord.MessageEmbed()
                    .setColor('#f5ea92')
                    .setTitle('In Queue:');

                let returnMsg = '';
                if(botHandler[guildkey].playQueue.length == 0) returnMsg = LANG.queue.isEmpty;
                else {
                    botHandler[guildkey].playQueue.forEach((element, index) => {
                        returnMsg += `${returnMsg === '' ? '' : '\n'}[${index + 1}] ${DATABASE.champions[element.soundRef.championKey].name}: ${DATABASE.champions[element.soundRef.championKey].lines[element.soundRef.lineIndex].line} (after ${element.delayTime}s)`;
                    });
                }

                EMBEDMSGS.queue.addField('\u200b', returnMsg);

                return message.channel.send(EMBEDMSGS.queue);
            } else if(command === 'autoplay') {
                autoplayHandler(guildkey, message, args);
            } else if(command === 'skip') {
                if(botHandler[guildkey].playQueue.length == 0) {
                    return message.channel.send(`${LANG.queue.isEmpty} ${autodelete.settings.commands.skip ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.skip, message, sentMessage);
                    });
                } else {
                    botHandler[guildkey].playQueue.shift();

                    clearInterval(botHandler[guildkey].runningInterval);
                    checkQueue(guildkey);

                    return message.channel.send(`${LANG.commands.skip.success} ${autodelete.settings.commands.skip ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.skip, message, sentMessage);
                    });
                }
            }
        } else return message.channel.send(LANG.commands.notInServer);
    } catch(error) { console.log(error); }

    return;
}





function joinVoiceChannel(voiceChannel) {
    return new Promise((resolve, reject) => {
        if(!voiceChannel) reject();
        else resolve(voiceChannel.join());
    });
}

function leaveVoiceChannel(voiceChannel) {
    return new Promise((resolve, reject) => {
        if(!voiceChannel) reject();
        else {
            voiceChannel.join().then(() => {
                resolve(voiceChannel.leave());
            });
        }
    }); 
}





function playHandler(guildkey, message, args, fromAUTOPLAY = false) {
    let userkey = message.author.id;

    if(botHandler[guildkey].users[userkey].inMultipleSearchResult) {
        botHandler.flushQueueMessages(guildkey, userkey);
        botHandler[guildkey].users[userkey] = new BHUser();
    }/* if(botHandler[guildkey].users[userkey].inAutoplaySettings) {
        botHandler[guildkey].users[userkey].inAutoplaySettings = false;
    }*/

    let repeatTimes = 1;
    let delayTime = defaultDelayTime;

    if(botHandler[guildkey].playQueue.length == 0) delayTime = 0;

    if(args.length && args[0] != 0) {
        if(!isNaN(parseInt(args[args.length - 1]))) {
            delayTime = parseInt(args[args.length - 1]);
            args.pop();
        } if(args[args.length - 1].startsWith('repeat')) {
            repeatTimes = parseInt(args[args.length - 1].replace('repeat', ''));
            args.pop();
        }
    }


    let searchResult = null; // searchDatabase(keywords[], championName); 
    let soundRef = {};


    if(args.length) {
        if(args[0] == 0) {
            soundRef = new SoundRef(args[1], args[2]);
            repeatTimes = args[3];
            delayTime = args[4];
        } else if(args[0].isAChampion() || (args[0] + args[1]).isAChampion()) {
            let championKey = (args[0].isAChampion() ? args.shift() : args.splice(0, 2)).championNameToKey();
            if(args.length) { // search from champ
                searchResult = searchDatabase(args, championKey);
            } else {
                soundRef = new SoundRef(championKey) // random from champ
                if(fromAUTOPLAY) return new Promise((resolve, reject) => {
                    resolve({ mode: 'scrl', championKey: championKey, repeatTimes: repeatTimes });
                });
            }
        } else searchResult = searchDatabase(args); // search from all
    } else {
        soundRef = new SoundRef(); // random from all
        if(fromAUTOPLAY) return new Promise((resolve, reject) => {
            resolve({ mode: 'rcrl', repeatTimes: repeatTimes });
        })
    }

    if(searchResult) {
        if(!searchResult.championKeys.length || !searchResult.championDatabaseLineIndex.length) {
            if(fromAUTOPLAY) return new Promise((resolve, reject) => {
                reject(LANG.searchResult.invalidSearch);
            });

            return message.channel.send(`${LANG.searchResult.invalidSearch} ${autodelete.settings.commands.play ? autodelete.message : ''}`).then(sentMessage => {
                checkDeleteMessage(autodelete.settings.commands.play, message, sentMessage);
            });
        } else if(searchResult.championKeys.length == 1) {
            if(searchResult.championDatabaseLineIndex[0].length == 1) soundRef = new SoundRef(searchResult.championKeys[0], searchResult.championDatabaseLineIndex[0][0]);
            else return multipleSearchResultHandler(guildkey, message, message.channel, message.member.voice.channel, searchResult, fromAUTOPLAY);
        } else return multipleSearchResultHandler(guildkey, message, message.channel, message.member.voice.channel, searchResult, fromAUTOPLAY);
    }

    if(soundRef != {}) {
        if(!fromAUTOPLAY && !message.member.voice.channel) {
            return message.channel.send(`${LANG.user.notInVoiceChannel} ${autodelete.settings.commands.play ? autodelete.message : ''}`).then(sentMessage => {
                checkDeleteMessage(autodelete.settings.commands.play, message, sentMessage);
            });
        }

        if(fromAUTOPLAY) return new Promise((resolve, reject) => {
            resolve({ mode: 'scsl', soundRef: soundRef, repeatTimes: repeatTimes });
        });

        for(let i = 1; i <= repeatTimes; i++)
            addToQueue(guildkey, message.channel, message.member.voice.channel, soundRef, delayTime, i == repeatTimes ? (args[0] == 0 ? [] : [message]) : [], i == repeatTimes ? true : false);
        if(!botHandler[guildkey].isPlaying && botHandler[guildkey].playQueue.length == repeatTimes) checkQueue(guildkey);
    } else {
        if(fromAUTOPLAY) return new Promise((resolve, reject) => {
            reject(LANG.champion.noLines);
        });

        return message.channel.send(`${LANG.champion.noLines} ${autodelete.settings.commands.play ? autodelete.message : ''}`).then(sentMessage => {
            checkDeleteMessage(autodelete.settings.commands.play, message, sentMessage);
        });
    }

    if(botHandler[guildkey].users[userkey].inMultipleSearchResult) botHandler[guildkey].users[userkey].inMultipleSearchResult = false;
}

function randomSound(championName = null) {
    if(!championName || championName == null) {
        for( ; ; ) {
            championName = Object.keys(DATABASE.champions).genRandomItem();
            if(DATABASE.champions[championName].lines) if(DATABASE.champions[championName].lines.length) break;
        }
    }

    if(DATABASE.champions[championName].lines) return (DATABASE.champions[championName].lines.length) ? new SoundRef(championName, DATABASE.champions[championName].lines.genRandomIndex()) : {};
    else return [];
}

const playSound = function(guildkey, fromAUTOPLAY = false) {
    if(botHandler[guildkey].isPlaying) return;
    joinVoiceChannel(botHandler[guildkey].playQueue[0].voiceChannel).then(connection => {
        botHandler[guildkey].isPlaying = true;

        /*if(botHandler[guildkey].currentlyPlayingMessage) {
            if(botHandler[guildkey].currentlyPlayingMessage.deletable && !botHandler[guildkey].currentlyPlayingMessage.deleted) {
                botHandler[guildkey].currentlyPlayingMessage.delete();
            }
        }*/

        // botHandler[guildkey].currentlyPlayingMessage = new Discord.MessageEmbed()
        let cpm = new Discord.MessageEmbed()
            .setColor('#009dff')
            .setThumbnail(`${DATABASE.urlpref}${DATABASE.champions[botHandler[guildkey].playQueue[0].soundRef.championKey].icon}`) //.slice(0, DATABASE.champions[botHandler[guildkey].playQueue[0].soundRef[0]].icon.indexOf('/revision/'))}`)
            .setTitle(DATABASE.champions[botHandler[guildkey].playQueue[0].soundRef.championKey].lines[botHandler[guildkey].playQueue[0].soundRef.lineIndex].line);

        botHandler[guildkey].playQueue[0].textChannel.send(cpm).then(sentMessage => botHandler[guildkey].currentlyPlayingMessage = sentMessage);


        const dispatcher = connection.play(`${DATABASE.urlpref}${DATABASE.champions[botHandler[guildkey].playQueue[0].soundRef.championKey].lines[botHandler[guildkey].playQueue[0].soundRef.lineIndex].loc}`);
        dispatcher.setVolume(0.75);
        dispatcher.on('finish', async () => {
            // console.log('finished playing');

            botHandler[guildkey].isPlaying = false;

            if(botHandler[guildkey].currentlyPlayingMessage) {
                if(botHandler[guildkey].currentlyPlayingMessage.deletable && !botHandler[guildkey].currentlyPlayingMessage.deleted) {
                    botHandler[guildkey].currentlyPlayingMessage.delete();
                }
            }

            if(botHandler[guildkey].playQueue[0].messages.length > 0) botHandler[guildkey].playQueue[0].messages.forEach(message => {
                if(message.deletable && !message.deleted) message.delete();
            });

            await botHandler[guildkey].playQueue.shift();

            if(botHandler[guildkey].playQueue.length != 0) checkQueue(guildkey);
        });
    }).catch(console.error);
}

function checkQueue(guildkey) {
    if(botHandler[guildkey].playQueue.length == 0) return;

    if(botHandler[guildkey].playQueue[0].delayTime == 0) playSound(guildkey);
    else botHandler[guildkey].runningInterval = setTimeout(playSound, botHandler[guildkey].playQueue[0].delayTime * 1000, guildkey);
}

function addToQueue(guildkey, textChannel, voiceChannel, soundRef, delay, messages, sendMessageATQ = true, fromAUTOPLAY = false) {
    if(fromAUTOPLAY) {
        if(soundRef.mode === 'rcrl') soundRef = new SoundRef();
        else if(soundRef.mode === 'scrl') soundRef = new SoundRef(soundRef.championKey);
        else if(soundRef.mode === 'scsl') soundRef = soundRef.soundRef;
    }
    if(sendMessageATQ && botHandler[guildkey].playQueue.length > 0) textChannel.send(`${LANG.commands.play.addedToQueue.replace('%c%', DATABASE.champions[soundRef.championKey].name).replace('%l%', DATABASE.champions[soundRef.championKey].lines[soundRef.lineIndex].line)}`).then(sentMessage => messages.push(sentMessage));
    botHandler[guildkey].playQueue.push({
        textChannel: textChannel,
        voiceChannel: voiceChannel,
        soundRef: soundRef,
        delayTime: delay,
        messages: messages == null ? [] : messages
    });
}





function searchDatabase(keywords, specificChampionName = null) {
    let fullSearchLine = '';
    keywords.forEach((arg, index) => fullSearchLine += arg + (index == keywords.length - 1 ? '' : ' '));


    let championsWithLine = []; // str championName
    let championFullLines = []; // all lines $$
    let championLineIndex = [];
    let championDatabaseIndex = [];

    // console.log('Searching database...');

    if(!specificChampionName) {
        Object.keys(SCONST).forEach(championKey => {
            if(SCONST[championKey].indexOf(fullSearchLine) != -1) {
                championsWithLine.push(championKey);
                championFullLines.push(SCONST[championKey]);
            }
        });
    } else {
        championsWithLine.push(specificChampionName);
        championFullLines.push(SCONST[specificChampionName]);
    }

    championsWithLine.forEach((championKey, index) => {
        championLineIndex[index] = [];
        championDatabaseIndex[index] = [];

        for( ; ; ) {
            if(championFullLines[index].indexOf(fullSearchLine) == -1) break;

            let firstIndex = championFullLines[index].indexOf(fullSearchLine);
            let str1 = championFullLines[index].slice(0, firstIndex + fullSearchLine.length);
            let str2 = championFullLines[index].slice(firstIndex + fullSearchLine.length);

            championDatabaseIndex[index].push(str1.split('$$').length - 1);
            str1 = str1.replace(fullSearchLine, '%');
            championFullLines[index] = str1.concat(str2);
        }
    });

    for(let i = championsWithLine.length - 1; i >= 0; i--) {
        if(championDatabaseIndex[i].length == 0) {
            championsWithLine.splice(i, 1);
            championDatabaseIndex.splice(i, 1);
        } else {
            for(let ii = championDatabaseIndex[i].length - 1; ii >= 0; ii--) {
                if(ii > 0) {
                    if(championDatabaseIndex[i][ii] == championDatabaseIndex[i][ii - 1]) {
                        championDatabaseIndex[i].splice(ii, 1);
                    }
                }
            }
        }
    }

    return { championKeys: championsWithLine, championDatabaseLineIndex: championDatabaseIndex, fullSearchLine: fullSearchLine };
}

function multipleSearchResultHandler(guildkey, message, textChannel, voiceChannel, searchResult, fromAUTOPLAY = false) {
    let userkey = message.author.id;

    let messages = [message];
    let numberOfResults = 0;
    let champions = [];
    let expandedSearchResult = [];


    searchResult.championKeys.forEach((championKey, index) => {
        champions.push({ championKey: championKey, index: [] });
        searchResult.championDatabaseLineIndex[index].forEach(lineIndex => {
            champions[index].index.push(lineIndex);

            numberOfResults++;

            expandedSearchResult.push({ championKey: championKey, index: lineIndex });
        });
    });




    botHandler[guildkey].users[userkey].inMultipleSearchResult = true;
    botHandler[guildkey].users[userkey].searchResult = searchResult;
    botHandler[guildkey].users[userkey].messages = messages;
    botHandler[guildkey].users[userkey].voiceChannel = voiceChannel;
    botHandler[guildkey].users[userkey].expandedSearchResult = expandedSearchResult;
    botHandler[guildkey].users[userkey].fullSearchLine = searchResult.fullSearchLine;
    botHandler[guildkey].users[userkey].lastPageNumber = Math.ceil(numberOfResults / resultsPerPage);

    sendSearchResults(guildkey, userkey, textChannel, 1);

    if(fromAUTOPLAY) return new Promise((resolve, reject) => {
        reject(LANG.commands.autoplay.add.multipleSearchResults);
    });

    return;
}

function selectHandler(guildkey, userkey, message, textChannel, args) {
    botHandler[guildkey].users[userkey].messages.push(message);

    if(!botHandler[guildkey].users[userkey].inMultipleSearchResult) return textChannel.send(`${LANG.commands.invalidUse}`).then(sentMessage => botHandler[guildkey].users[userkey].messages.push(sentMessage));
    else {
        botHandler.flushQueueMessages(guildkey, userkey);
        if(!args.length) {
            sendSearchResults(guildkey, userkey, textChannel);
            return textChannel.send(`${LANG.commands.invalidUse}`).then(msg => botHandler[guildkey].users[userkey].messages.push(msg));
        } else if(!isNaN(parseInt(args[0]))) { // change page number
            let pageNumber = parseInt(args[0]);

            if(pageNumber >= 1 && pageNumber <= botHandler[guildkey].users[userkey].lastPageNumber) {
                sendSearchResults(guildkey, userkey, textChannel, parseInt(args[0]));
            } else {
                sendSearchResults(guildkey, userkey, textChannel);
                return textChannel.send(`${LANG.pageOutOfBounds.replace('%page%', pageNumber)}`).then(msg => botHandler[guildkey].users[userkey].messages.push(msg));
            }
        } else {
            let championKey = 'foo';
            if(args[0].isAChampion() || (args[0] + args[1]).isAChampion()) championKey = (args[0].isAChampion() ? args.shift() : args.splice(0, 2)).championNameToKey();

            let indexofchampion = botHandler[guildkey].users[userkey].searchResult.championKeys.indexOf(championKey);
            if(indexofchampion == -1) { // invalid champion
                sendSearchResults(guildkey, userkey, textChannel);
                return textChannel.send(`${LANG.commands.select.invalidChampion}`).then(msg => botHandler[guildkey].users[userkey].messages.push(msg));
            } else { // valid champion
                if(!args.length) { // not enough arguments
                    sendSearchResults(guildkey, userkey, textChannel);
                    return textChannel.send(`${LANG.commands.notEnoughArguments}`).then(msg => botHandler[guildkey].users[userkey].messages.push(msg));
                } else if(isNaN(parseInt(args[0]))) { // NaN
                    sendSearchResults(guildkey, userkey, textChannel);
                    return textChannel.send(`${LANG.commands.NaN.replace('%n%', args[0])}`).then(msg => botHandler[guildkey].users[userkey].messages.push(msg));
                }

                let indexofindex = botHandler[guildkey].users[userkey].searchResult.championDatabaseLineIndex[indexofchampion].indexOf(parseInt(args[0]));
                if(indexofindex == -1) {
                    // invalid index
                    sendSearchResults(guildkey, userkey, textChannel);
                    return textChannel.send(`${LANG.commands.select.invalidIndex}`).then(msg => botHandler[guildkey].users[userkey].messages.push(msg));
                } else {
                    // success
                    let lineIndex = parseInt(args[0]);

                    let repeatTimes = 1;
                    let delayTime = defaultDelayTime;
                    

                    if(botHandler[guildkey].playQueue.length == 0) delayTime = 0;
                    // index
                    // index delay
                    // index repeat
                    // index repeat delay
                    if(args.length >= 2) { // 2 or 3 or 4
                        if(!isNaN(parseInt(args[args.length - 1]))) { // 2 or 4
                            delayTime = parseInt(args.pop());
                        } if(args[args.length - 1].startsWith('repeat')) {
                            repeatTimes = parseInt(args.pop().replace('repeat', ''));
                        }
                    }

                    if(botHandler[guildkey].users[userkey].inAutoplaySettings) {
                        // console.log('add');
                        botHandler[guildkey].users[userkey].inAutoplaySettings = false;
                        autoplayadd(guildkey, userkey, null, textChannel, { mode: 'scsl', soundRef: new SoundRef(championKey, lineIndex), repeatTimes: repeatTimes });
                        return;
                    } else {
                        playHandler(guildkey, message, [0, championKey, lineIndex, repeatTimes, delayTime]);
                    }
                }
            }
        }
    }
}

function sendSearchResults(guildkey, userkey, textChannel, pageNumber = botHandler[guildkey].users[userkey].currentPageNumber) {
    let numberOfResults = botHandler[guildkey].users[userkey].expandedSearchResult.length;

    let minResultNumber = (pageNumber - 1) * resultsPerPage + 1;
    let maxResultNumber = (pageNumber * resultsPerPage) > numberOfResults ? numberOfResults : (pageNumber * resultsPerPage);

    botHandler[guildkey].users[userkey].currentPageNumber = pageNumber;

    botHandler[guildkey].users[userkey].searchResultEmbed = new Discord.MessageEmbed()
        .setColor('#80c904')
        .setTitle(LANG.searchResult.multipleSearchResults.replace('%num%', numberOfResults))
        .setDescription(LANG.searchResult.showingPageResult
            .replace('%min%', minResultNumber)
            .replace('%max%', maxResultNumber)
            .replace('%all%', numberOfResults).replace('%page%', pageNumber)
            .replace('%lastpage%', botHandler[guildkey].users[userkey].lastPageNumber))
        .setFooter(`${LANG.searchResult.selectCommand.replace('%p%', PREFIX)}\n${LANG.searchResult.pageCommand.replace('%p%', PREFIX)}`);

    let srlines1 = '';
    let finishedSR1 = false;
    let srlines2 = '';
    let finishedSR2 = false;
    let srlines3 = '';

    for(let index = minResultNumber - 1; index <= maxResultNumber - 1; index++) {
        let searchResult = botHandler[guildkey].users[userkey].expandedSearchResult[index];
        let newline = `[${DATABASE.champions[searchResult.championKey].name}] ${searchResult.index} : ${DATABASE.champions[searchResult.championKey].lines[searchResult.index].line}`;
        if(!finishedSR1) {
            if((srlines1 + newline).length >= 1023) {
                finishedSR1 = true;
                srlines2 += `${srlines1 === '' ? '' : '\n'}${newline}`;
            } else srlines1 += `${srlines1 === '' ? '' : '\n'}${newline}`;
        } else if(!finishedSR2) {
            if((srlines2 + newline).length >= 1023) {
                finishedSR2 = true;
                srlines3 += `${srlines2 === '' ? '' : '\n'}${newline}`;
            } else srlines2 += `${srlines2 === '' ? '' : '\n'}${newline}`;
        } else srlines3 += `${srlines3 === '' ? '' : '\n'}${newline}`;
    }

    botHandler[guildkey].users[userkey].searchResultEmbed.addField(`Search: ${botHandler[guildkey].users[userkey].fullSearchLine}`, srlines1, false);
    if(srlines2 !== '') botHandler[guildkey].users[userkey].searchResultEmbed.addField('\u200b', srlines2, false);
    if(srlines3 !== '') botHandler[guildkey].users[userkey].searchResultEmbed.addField('\u200b', srlines3, false);

    textChannel.send(botHandler[guildkey].users[userkey].searchResultEmbed).then(msg => botHandler[guildkey].users[userkey].messages.push(msg));
}

function autoplayHandler(guildkey, message, args) {
    if(botHandler[guildkey].autoplay == null) botHandler[guildkey].autoplay = new AutoPlay();

    let userkey = message.author.id;


    let subcmd = args.length > 0 ? args.shift() : 'view';
    
    if(subcmd === 'view') {
        botHandler[guildkey].autoplay.viewMessageEmbed = new Discord.MessageEmbed()
            .setColor('#EA3C53')
            .setTitle('AutoPlay')
            .setFooter(`Do ${PREFIX}autoplay start to start.`);
        
        let vmsg = botHandler[guildkey].autoplay.list.length == 0 ? LANG.commands.autoplay.view.empty : '';

        for(let i = 0; i < botHandler[guildkey].autoplay.list.length; i++) {
            vmsg += `${vmsg === '' ? '' : '\n'}[${i}] `;
            if(botHandler[guildkey].autoplay.list[i].mode === 'rcrl') vmsg += '[Random]';
            else if(botHandler[guildkey].autoplay.list[i].mode === 'scrl') vmsg += `[${DATABASE.champions[botHandler[guildkey].autoplay.list[i].championKey].name} random]`;
            else if(botHandler[guildkey].autoplay.list[i].mode === 'scsl') vmsg += `${DATABASE.champions[botHandler[guildkey].autoplay.list[i].soundRef.championKey].name}: ${DATABASE.champions[botHandler[guildkey].autoplay.list[i].soundRef.championKey].lines[botHandler[guildkey].autoplay.list[i].soundRef.lineIndex].line}`;
        }

        botHandler[guildkey].autoplay.viewMessageEmbed.addField('\u200B', vmsg);

        message.channel.send(botHandler[guildkey].autoplay.viewMessageEmbed);

    } else if(subcmd === 'play' || subcmd === 'start') {
        botHandler[guildkey].autoplay.isPlaying = true;
        botHandler[guildkey].autoplay.textChannel = message.channel;
        if(!message.member.voice.channel) {
            return message.channel.send(`${LANG.user.notInVoiceChannel} ${autodelete.settings.commands.autoplay.play ? autodelete.message : ''}`).then(sentMessage => {
                checkDeleteMessage(autodelete.settings.commands.autoplay.play, message, sentMessage);
            });
        }
        botHandler[guildkey].autoplay.voiceChannel = message.member.voice.channel;

        if(botHandler[guildkey].autoplay.list.length == 0) botHandler[guildkey].autoplay.list.push({ mode: 'rcrl' });


        botHandler[guildkey].autoplay.runningInterval = setInterval(autoplayfunction, botHandler[guildkey].autoplay.timer * 1000, guildkey);

        return message.channel.send(`${LANG.commands.autoplay.play} ${autodelete.settings.commands.autoplay.play ? autodelete.message : ''}`).then(sentMessage => {
            checkDeleteMessage(autodelete.settings.commands.autoplay.play, message, sentMessage);
        });
    } else if(subcmd === 'pause' || subcmd === 'stop') {
        botHandler[guildkey].autoplay.isPlaying = false;
        clearInterval(botHandler[guildkey].autoplay.runningInterval);

        return message.channel.send(`${LANG.commands.autoplay.pause} ${autodelete.settings.commands.autoplay.pause ? autodelete.message : ''}`).then(sentMessage => {
            checkDeleteMessage(autodelete.settings.commands.autoplay.pause, message, sentMessage);
        });
    } else if(subcmd === 'clear') {
        if(botHandler[guildkey].autoplay.isPlaying) {
            botHandler[guildkey].autoplay.isPlaying = false;
            clearInterval(botHandler[guildkey].autoplay.runningInterval);
        }

        botHandler[guildkey].autoplay = new AutoPlay();
        return message.channel.send(`${LANG.commands.autoplay.clear} ${autodelete.settings.commands.autoplay.clear ? autodelete.message : ''}`).then(sentMessage => {
            checkDeleteMessage(autodelete.settings.commands.autoplay.clear, message, sentMessage);
        });
    } else if(subcmd === 'settimer') {
        if(isNaN(parseInt(args[0]))) {
            return message.channel.send(`${LANG.commands.NaN.replace('%n%', args[0])} ${autodelete.settings.commands.autoplay.settimer ? autodelete.message : ''}`).then(sentMessage => {
                checkDeleteMessage(autodelete.settings.commands.autoplay.settimer, message, sentMessage);
            });
        } else {
            botHandler[guildkey].autoplay.timer = parseInt(args[0]);

            if(botHandler[guildkey].autoplay.isPlaying) {
                clearInterval(botHandler[guildkey].autoplay.runningInterval);
                setInterval(autoplayfunction, botHandler[guildkey].autoplay.timer * 1000, guildkey);
            }

            return message.channel.send(`${LANG.commands.autoplay.settimer.replace('%t%', args[0])} ${autodelete.settings.commands.autoplay.settimer ? autodelete.message : ''}`).then(sentMessage => {
                checkDeleteMessage(autodelete.settings.commands.autoplay.settimer, message, sentMessage);
            });
        }
    } else if(subcmd === 'add') {
        let apindex = -1;
        if(!isNaN(parseInt(args[0]))) apindex = parseInt(args.shift());

        botHandler[guildkey].users[userkey].inAutoplaySettings = true;

        playHandler(guildkey, message, args, true).then(returnObj => {
            autoplayadd(guildkey, userkey, message, message.channel, returnObj, apindex);
        }, onReject => {
            return message.channel.send(`${onReject} ${autodelete.settings.commands.autoplay.add ? autodelete.message : ''}`).then(sentMessage => {
                checkDeleteMessage(autodelete.settings.commands.autoplay.add, message, sentMessage);
            });
        });
    } else if(subcmd === 'remove') {
        if(args.length) {
            if(isNaN(parseInt(args[0]))) {
                return message.channel.send(`${LANG.commands.NaN.replace('%n%', args[0])} ${autodelete.settings.commands.autoplay.remove ? autodelete.message : ''}`).then(sentMessage => {
                    checkDeleteMessage(autodelete.settings.commands.autoplay.remove, message, sentMessage);
                });
            } else {
                let index = parseInt(args[0]);

                if(index < 0 || index >= botHandler[guildkey].autoplay.list.length) {
                    return message.channel.send(`${LANG.outOfBounds} ${autodelete.settings.commands.autoplay.remove ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.autoplay.remove, message, sentMessage);
                    });
                } else {
                    botHandler[guildkey].autoplay.list.splice(index, 1);

                    if(index > botHandler[guildkey].autoplay.commandIndex) botHandler[guildkey].autoplay.commandIndex--;

                    if(botHandler[guildkey].autoplay.list.length == 0) {
                        return autoplayHandler(guildkey, message, ['clear']);
                    }

                    return message.channel.send(`${LANG.commands.autoplay.remove.replace('%i%', index)} ${autodelete.settings.commands.autoplay.remove ? autodelete.message : ''}`).then(sentMessage => {
                        checkDeleteMessage(autodelete.settings.commands.autoplay.remove, message, sentMessage);
                    });
                }
            }
        } else return message.channel.send(`${LANG.commands.notEnoughArguments} ${LANG.commands.autoplay.remove ? autodelete.message : ''}`).then(sentMessage => {
            checkDeleteMessage(autodelete.settings.commands.autoplay.remove, message, sentMessage);
        });
    } else {
        return message.channel.send(`${LANG.commands.invalidUse.replace('%p%', PREFIX).replace('%cmd%', 'autoplay')} ${autodelete.settings.commands.autoplay.invalidUse ? autodelete.message : ''}`).then(sentMessage => {
            checkDeleteMessage(autodelete.settings.commands.autoplay.invalidUse, message, sentMessage);
        });
    }
}

function autoplayadd(guildkey, userkey, message, textChannel, APOBJECT, index = -1) {
    botHandler[guildkey].users[userkey].inAutoplaySettings = false;

    for(let i = 1; i <= APOBJECT.repeatTimes; i++) {
        if(index == -1) botHandler[guildkey].autoplay.list.push(APOBJECT);
        else botHandler[guildkey].autoplay.list.splice(index, 0, APOBJECT);
    }

    let sendmsg = '';

    if(APOBJECT.mode === 'rcrl') sendmsg = LANG.commands.autoplay.add.rChampionrLine;
    else if(APOBJECT.mode === 'scrl') sendmsg = LANG.commands.autoplay.add.sChampionrLine.replace('%c%', DATABASE.champions[APOBJECT.championKey].name);
    else if(APOBJECT.mode === 'scsl') sendmsg = LANG.commands.autoplay.add.sChampionsLine
        .replace('%c%', DATABASE.champions[APOBJECT.soundRef.championKey].name)
        .replace('%l%', DATABASE.champions[APOBJECT.soundRef.championKey].lines[APOBJECT.soundRef.lineIndex].line);

    textChannel.send(`${sendmsg} ${autodelete.settings.commands.autoplay.add ? autodelete.message : ''}`).then(sentMessage => {
            checkDeleteMessage(autodelete.settings.commands.autoplay.add, sentMessage);
            if(message != null) checkDeleteMessage(autodelete.settings.commands.autoplay.add, message);
        });
}

function autoplayfunction(guildkey) {
    if(botHandler[guildkey].isPlaying) return;

    addToQueue(guildkey, botHandler[guildkey].autoplay.textChannel, botHandler[guildkey].autoplay.voiceChannel, botHandler[guildkey].autoplay.list[botHandler[guildkey].autoplay.commandIndex], 0, null, false, true);
    playSound(guildkey, true);

    botHandler[guildkey].autoplay.commandIndex++;
    if(botHandler[guildkey].autoplay.commandIndex == botHandler[guildkey].autoplay.list.length) botHandler[guildkey].autoplay.commandIndex = 0;
}






/*function Stringify_WithSpaces(obj) { // https://stackoverflow.com/questions/24834812/space-in-between-json-stringify-output
	let result = JSON.stringify(obj, null, 4); // stringify, with line-breaks and indents
	// result = result.replace(/^ +/gm, " "); // remove all but the first space for each line
	// result = result.replace(/\n/g, ""); // remove line-breaks
	// result = result.replace(/{ /g, "{").replace(/ }/g, "}"); // remove spaces between object-braces and first/last props
	// result = result.replace(/\[ /g, "[").replace(/ \]/g, "]"); // remove spaces between array-brackets and first/last items
	return result;
}*/

async function saveDatabase() {
    return new Promise((resolve, reject) => {
        try {
            fs.writeFile('./test.json', JSON.stringify(DATABASE, null, 4), (error) => {
                if(error) {
                    console.log(error);
                    reject();
                } else resolve();
            });
        } catch(error) {
            console.log(error);
            reject();
        }
    });
}

function fetchdata(url) {
    return new Promise(async (resolve, reject) => {
        try {
            const result = await axios.get(url);
            resolve(cheerio.load(result.data));
        } catch(error) {
            console.log(error);
            reject();
        }
    });
}

function readdata(championKey) {
    return new Promise(async (resolve, reject) => {
        if(DATABASE.champions[championKey].loadedLines) return resolve({ championKey: championKey, numberOfLines: DATABASE.champions[championKey].lines.length });

        // console.log(`Fetching [${DATABASE.champions[championKey].name}]'s lines...`);

        await fetchdata(DATABASE.champions[championKey].link).then(async onResolve => {
            const $ = onResolve;

            let buttonArr = $('div#mw-content-text ul > li > span.audio-button:first-child button');
    
            if(!DATABASE.champions[championKey]) DATABASE.champions[championKey] = {
                link: '',
                lines: []
            };
    
            DATABASE.champions[championKey].lines = [];
    
            $(buttonArr).each((index, element) => {
                let fulltext = element.attribs.onclick;
    
                let url = fulltext.slice(fulltext.indexOf('https://'), fulltext.indexOf('/revision'));
                let altURL = fulltext.slice(fulltext.indexOf('/wiki/'), fulltext.indexOf('\",\"isVideo'));
    
    
                let parentLI = element.parent.parent.parent;
                let voiceline = $(parentLI).siblings('i').length > 0 ? $(parentLI).siblings('i').text() : '[no line]';
    
                // console.log(`${url} || ${altURL} || ${voiceline}`);
    
                DATABASE.champions[championKey].lines.push({
                    loc: url.slice(url.indexOf('/images/') + 8),
                    altURL: altURL,
                    line: voiceline
                });
            });

            DATABASE.champions[championKey].loadedLines = true;
    
            // console.log(`Finished fetching [${DATABASE.champions[championKey].name}]'s lines.`);
    
            resolve({ championKey: championKey, numberOfLines: DATABASE.champions[championKey].lines.length });
        }, () => reject());
    });
}

function loadChampion(championKey) {
    return new Promise(async (resolve, reject) => {
        if(DATABASE.champions[championKey].loadedLines) reject();
        else {
            readdata(championKey).then(data => {
                loadStoredDatabase();

                resolve(data.numberOfLines);
            }, () => reject());
        }
    });
}

function loadAllChampionLines(sentMessage) {
    return new Promise(async (resolve, reject) => {
        try {
            let numberOfLines = 0;

            let errorsInLoading = [];

            const asyncForEach = async function(array, callback) {
                for(let i = 0; i < array.length; i++)
                    await callback(array[i]);
            }
        
            let numberOfLoadedChampions = 0;
            let numberOfChampions = Object.keys(DATABASE.champions).length;
        
            let canUpdate = true; 
        
            await asyncForEach(Object.keys(DATABASE.champions), async (championKey) => {
                readdata(championKey).then(returnData => {
                    numberOfLoadedChampions++;
                    numberOfLines += returnData.numberOfLines;
        
                    console.log(`${numberOfLoadedChampions} finished with ${championKey}`);
                    
                    if(canUpdate) {
                        sentMessage.edit(`\`\`\`${LANG.commands.load.progressLoadingAllChampionLines
                            .replace('%p%', progressBar(numberOfLoadedChampions, numberOfChampions))
                            .replace('%lc%', numberOfLoadedChampions)
                            .replace('%num%', numberOfChampions)
                            .replace('%c%', DATABASE.champions[returnData.championKey].name)
                            .replace('%nl%', returnData.numberOfLines)
                        }\`\`\``);
        
                        canUpdate = false;
                        setTimeout(() => { canUpdate = true; }, 3000);
                    }
        
                    if(numberOfLoadedChampions == numberOfChampions) {
                        setTimeout(() => {
                            sentMessage.edit(`${LANG.commands.load.finishedLoadingAllChampionLines.replace('%c%', Object.keys(DATABASE.champions).length).replace('%num%', numberOfLines)}${errorsInLoading.length > 0 ? `\n${LANG.commands.load.errorLoadingChampionLines.replace('%num%', errorsInLoading.length).replace('%ca%', errorsInLoading)}` : ''}${autodelete.settings.commands.load ? `\n${autodelete.message}` : ''}`).then(editedMessage => {
                                resolve(editedMessage);
                            }).catch(console.error);
                        }, 1000);
        
                        loadStoredDatabase();
                    }
                }, () => {
                    numberOfLoadedChampions++;
                    errorsInLoading.push(DATABASE.champions[championKey].name);
                });
            }).catch(console.error);
        } catch(error) {
            console.log(error);
            reject();
        }
    });
}

function loadStoredDatabase() {
    // console.log('Loading database...');

    Object.keys(DATABASE.champions).forEach(championKey => {
        // console.log(`Loading champion [${championName.capitalizeFirstLetter()}]`);
        SCONST[championKey] = "";

        if(DATABASE.champions[championKey].lines)
            DATABASE.champions[championKey].lines.forEach((voiceLineArr, index) => {
                SCONST[championKey] += voiceLineArr.line.toLowerCase() + (index == DATABASE.champions[championKey].lines.length - 1 ? '' : '$$');
            });
    });

    // console.log('Finished loading database.');
}

function loadListOfChampions() {
    console.log('Loading list of champions...');

    return new Promise(async (resolve, reject) => {
        try {
            if(DATABASE.loadedListOfChampions) reject('already loaded list of champions');
            else {
                const $ = await fetchdata(DATABASE.listOfChampions);

                $('table tr > td:first-child[data-sort-value]').each((index, element) => {
                    let championNameOC = element.attribs['data-sort-value'];
                    let championKey = championNameOC.championNameToKey();
            
                    let innerhtml = $(element).html();
            
                    let firstSlice = innerhtml.slice(innerhtml.indexOf(DATABASE.urlpref) + DATABASE.urlpref.length);
                    let secondSlice = firstSlice.slice(0, firstSlice.indexOf('\"'));
            
                    let iconURL = innerhtml.slice(innerhtml.indexOf(DATABASE.urlpref) + DATABASE.urlpref.length, innerhtml.indexOf('/revision/latest'));
                    iconURL = secondSlice;
            
                    if(!DATABASE.champions[championKey]) DATABASE.champions[championKey] = {
                        link: DATABASE.wikiurl + championNameOC + '/' + 'Quotes',
                        name: championNameOC,
                        icon: iconURL,
                        loadedLines: false,
                        lines: []
                    };

                    else {
                        DATABASE.champions[championKey].link = DATABASE.wikiurl + championNameOC + '/' + 'Quotes';
                        DATABASE.champions[championKey].name = championNameOC;
                        DATABASE.champions[championKey].icon = iconURL;
                        DATABASE.champions[championKey].loadedLines = false;

                        if(!DATABASE.champions[championKey].lines) DATABASE.champions[championKey].lines = [];
                    }
                });
            
                loadStoredDatabase();

                // console.log(DATABASE.champions);
            
                console.log(`Finished loading list of champions (${Object.keys(DATABASE.champions).length}).`);
            
                DATABASE.loadedListOfChampions = true;
            
                resolve(Object.keys(DATABASE.champions).length);
            }
        } catch(error) {
            console.log(error);
            reject();
        }
    });
}





client.login(TOKEN);