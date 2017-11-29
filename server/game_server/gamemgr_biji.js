var roomMgr = require("./roommgr");
var userMgr = require("./usermgr");
var bjutils = require('./bjutils');
var db = require("../utils/db");
var crypto = require("../utils/crypto");
var games = {};
var gamesIdBase = 0;
var ACTION_CHUPAI = 1;

var gameSeatsOfUsers = {};

function getCardType(id){
    return Math.floor(id / 256);
}

function shuffle(game) {
    var cards = game.cards;
    var i,c,k,lastIndex,temp,index = 0;

    // c 表示花色， i表示牌
    for(i = 1; i <= 13; ++i){
        for(c = 0; c < 4; ++c){
            cards[index] = c*256 + i;
            index++;
        }
    }

    for (k = 0; k < 10; k++) {
        for (i = 0; i < cards.length; ++i) {
            lastIndex = cards.length - 1 - i;
            index = Math.floor(Math.random() * lastIndex);

            temp = cards[index];
            cards[index] = cards[lastIndex];
            cards[lastIndex] = temp;
        }
    }
}

function deal(game){
    //每人9 一共 9*5 ＝ 45
    var seatIndex = game.button;
    for(var i = 0; i < 45; ++i){
        var cards = game.gameSeats[seatIndex].holds;
        if(cards == null){
            cards = [];
            game.gameSeats[seatIndex].holds = cards;
        }

        if(game.gameSeats[seatIndex].userId >= 0)
            cards.push(game.cards[i]);

        seatIndex ++;
        seatIndex %= 5;
    }
}

function getSeatIndex(userId){
    var seatIndex = roomMgr.getUserSeat(userId);
    if(seatIndex == null){
        return null;
    }
    return seatIndex;
}

function getGameByUserID(userId){
    var roomId = roomMgr.getUserRoom(userId);
    if(roomId == null){
        return null;
    }
    var game = games[roomId];
    return game;
}

function calculateResult(game,roomInfo){
    var playerNum = 0;
    for(var i = 0; i < 5; i++){
        if(game.gameSeats[i].userId > 0){
            playerNum ++;
        }
    }

    var base = roomInfo.conf.baseScore;
    var scoreArray = [ base * playerNum, -1 * base, -2 * base, -3 * base, - 4* base];
    var seatsArray = [ 0, 1, 2, 3, 4 ];

    for(var i = 0; i < 3; i++){
        seatsArray.sort(function(a, b){
            if(a == 0) return true;
            if(b == 0) return false;
            var A = game.gameSeats[a].holds;
            var B = game.gameSeats[b].holds;
            return !bjutils.compare([A[3*i],A[3*i+1],A[3*i+2]] , [B[3*i],B[3*i+1],B[3*i+2]]);
        });

        for(var j = 0; j < 5; j++){
            var seat = seatsArray[j];
            if(game.gameSeats[seat].userId > 0){
                game.gameSeats[seat].score += scoreArray[j];
            }
        }
    }

    // TODO happy money
    //game.gameSeats[i].score
}

// 结算
function doGameOver(game,userId,forceEnd){
    var roomId = roomMgr.getUserRoom(userId);
    if(roomId == null){
        return;
    }
    var roomInfo = roomMgr.getRoom(roomId);
    if(roomInfo == null){
        return;
    }

    var results = [];
    var dbresult = [0,0,0,0,0];

    var fnNoticeResult = function(isEnd){
        userMgr.broacastInRoom('game_over_push',{results:results},userId,true);
        //如果局数已够，则进行整体结算，并关闭房间
        if(isEnd){
            setTimeout(function(){
                if(roomInfo.numOfGames > 1){
                    store_history(roomInfo);
                }
                userMgr.kickAllInRoom(roomId);
                roomMgr.destroy(roomId);
                db.archive_games(roomInfo.uuid);
            },1500);
        }
    }

    if(game != null){
        if(!forceEnd){
            calculateResult(game,roomInfo);
        }

        for(var i = 0; i < roomInfo.seats.length; ++i){
            var rs = roomInfo.seats[i];
            var sd = game.gameSeats[i];

            rs.ready = false;
            rs.score += sd.score

            var userRT = {
                userId:sd.userId,
                actions:[],
            }

            for(var k in sd.actions){
                userRT.actions[k] = {
                    type:sd.actions[k].type,
                };
            }
            results.push(userRT);

            dbresult[i] = sd.score;
            delete gameSeatsOfUsers[sd.userId];
        }
        delete games[roomId];
    }

    if(forceEnd || game == null){
        fnNoticeResult(true);
    } else{
        //保存游戏
        store_game(game,function(ret){
            db.update_game_result(roomInfo.uuid,game.gameIndex,dbresult);

            //记录玩家操作
            var str = JSON.stringify(game.actionList);
            db.update_game_action_records(roomInfo.uuid,game.gameIndex,str);

            //保存游戏局数
            db.update_num_of_turns(roomId,roomInfo.numOfGames);

            //如果是第一次，则扣除房卡
            if(roomInfo.numOfGames == 1){
                if(roomInfo.conf.maxGames == 8){
                    cost = 1;
                }else{
                    cost = 2;
                }
                db.cost_gems(game.gameSeats[0].userId,cost);
            }

            var isEnd = (roomInfo.numOfGames >= roomInfo.conf.maxGames);
            fnNoticeResult(isEnd);
        });
    }
}

function recordUserAction(game,seatData,type,target){
    var d = {type:type,targets:[]};
    if(target != null){
        if(typeof(target) == 'number'){
            d.targets.push(target);
        }
        else{
            d.targets = target;
        }
    }
    else{
        for(var i = 0; i < game.gameSeats.length; ++i){
            var s = game.gameSeats[i];
            if(i != seatData.seatIndex){
                d.targets.push(i);
            }
        }
    }

    seatData.actions.push(d);
    return d;
}

function recordGameAction(game,si,action,pai){
    game.actionList.push(si);
    game.actionList.push(action);
    if(pai != null){
        game.actionList.push(pai);
    }
}

exports.setReady = function(userId,callback){
    var roomId = roomMgr.getUserRoom(userId);
    if(roomId == null){
        return;
    }
    var roomInfo = roomMgr.getRoom(roomId);
    if(roomInfo == null){
        return;
    }

    roomMgr.setReady(userId,true);

    var game = games[roomId];
    if(game == null){
        if(roomInfo.creator == userId){
            var playerNum = 0;
            for(var i = 0; i < roomInfo.seats.length; ++i){
                var s = roomInfo.seats[i];
                if(s.userId <= 0)
                    continue;
                if(s.ready == false || userMgr.isOnline(s.userId)==false){
                    return;
                }
                playerNum++;
            }
            exports.begin(roomId, playerNum);
        }
    } else{
        // TODO 发送信息
        var remainingGames = roomInfo.conf.maxGames - roomInfo.numOfGames;

        var data = {
            state:game.state,
            chuPai:game.chuPai,
        };

        data.seats = [];
        var seatData = null;
        for(var i = 0; i < 5; ++i){
            var sd = game.gameSeats[i];

            var s = {
                userid:sd.userId,
                folds:sd.folds,
            }
            if(sd.userId == userId){
                s.holds = sd.holds;
                s.score = sd.score;
                s.huanpais = sd.huanpais;
                seatData = sd;
            }
            else{
                s.huanpais = sd.huanpais? []:null;
            }
            data.seats.push(s);
        }

        //同步整个信息给客户端
        userMgr.sendMsg(userId,'game_sync_push',data);
    }
}

function store_single_history(userId,history){
    db.get_user_history(userId,function(data){
        if(data == null){
            data = [];
        }
        while(data.length >= 10){
            data.shift();
        }
        data.push(history);
        db.update_user_history(userId,data);
    });
}

function store_history(roomInfo){
    var seats = roomInfo.seats;
    var history = {
        uuid:roomInfo.uuid,
        id:roomInfo.id,
        time:roomInfo.createTime,
        seats:new Array(5)
    };

    for(var i = 0; i < seats.length; ++i){
        var rs = seats[i];
        var hs = history.seats[i] = {};
        hs.userid = rs.userId;
        hs.name = crypto.toBase64(rs.name);
        hs.score = rs.score;
    }

    for(var i = 0; i < seats.length; ++i){
        var s = seats[i];
        store_single_history(s.userId,history);
    }
}


function construct_game_base_info(game){
    var baseInfo = {
        type:game.conf.type,
        button:game.button,
        index:game.gameIndex,
        mahjongs:game.mahjongs,
        game_seats:new Array(5)
    }
    for(var i = 0; i < 5; ++i){
        baseInfo.game_seats[i] = game.gameSeats[i].holds;
    }
    game.baseInfoJson = JSON.stringify(baseInfo);
}

function store_game(game,callback){
    db.create_game(game.roomInfo.uuid,game.gameIndex,game.baseInfoJson,callback);
}

//开始新的一局
exports.begin = function(roomId) {
    var roomInfo = roomMgr.getRoom(roomId);
    if(roomInfo == null){
        return;
    }
    var seats = roomInfo.seats;

    var game = {
        conf:roomInfo.conf,
        roomInfo:roomInfo,
        gameIndex:roomInfo.numOfGames,

        cards: new Array(52),
        gameSeats:new Array(5),

        chuPai:-1,
        state:"idle",
        actionList:[],
    };

    roomInfo.numOfGames++;

    for(var i = 0; i < 5; ++i){
        var data = game.gameSeats[i] = {};
        data.game = game;
        data.seatIndex = i;
        data.userId = seats[i].userId;
        data.actions = [];
        gameSeatsOfUsers[data.userId] = data;
    }

    games[roomId] = game;
    //洗牌
    shuffle(game);
    //发牌
    deal(game);

    for (var i = 0; i < seats.length; ++i) {
        //开局时，通知前端必要的数据
        var s = seats[i];
        if (s.userId >= 0) {
            //通知玩家手牌
            userMgr.sendMsg(s.userId, 'game_holds_push', game.gameSeats[i].holds);
            //通知还剩多少局
            userMgr.sendMsg(s.userId, 'game_num_push', roomInfo.numOfGames);
            //通知游戏开始
            userMgr.sendMsg(s.userId, 'game_begin_push', game.button);
        }
    }

    //如果没有人有操作，则向下一家发牌，并通知他出牌
    /* if(!hasActions){
        setTimeout(function(){
            userMgr.broacastInRoom('guo_notify_push',{userId:seatData.userId,pai:game.chuPai},seatData.userId,true);
            seatData.folds.push(game.chuPai);
            game.chuPai = -1;
            moveToNextUser(game);
            doUserMoPai(game);
        },500);
    }*/
};

exports.chuPai = function(userId, pai){

    var seatData = gameSeatsOfUsers[userId];
    if(seatData == null){
        console.log("can't find user game data.");
        return;
    }

    var game = seatData.game;
    var seatIndex = seatData.seatIndex;

    // 重复手牌检测
    for(var i = 0; i < 9; i++ ){
        for(var j = i+1; j < 9; j++){
            if(pai[i] == pai[j]){
                console.log("cheat:pai repeated." + pai);
                return;
            }
        }
    }

    for (var i = 0; i < 9; i++) {
        var index = seatData.holds.indexOf(pai[i]);
        if (index == -1) {
            console.log("holds:" + seatData.holds);
            console.log("can't find pai." + pai);
            return;
        }
    }

    seatData.holds = pai;

    recordGameAction(game,seatData.seatIndex,ACTION_CHUPAI,pai);
    userMgr.broacastInRoom('game_chupai_notify_push',{userId:seatData.userId,pai:pai},seatData.userId,true);
};



exports.isPlaying = function(userId){
    var seatData = gameSeatsOfUsers[userId];
    if(seatData == null){
        return false;
    }

    var game = seatData.game;

    if(game.state == "idle"){
        return false;
    }
    return true;
}

exports.hasBegan = function(roomId){
    var game = games[roomId];
    if(game != null){
        return true;
    }
    var roomInfo = roomMgr.getRoom(roomId);
    if(roomInfo != null){
        return roomInfo.numOfGames > 0;
    }
    return false;
};


var dissolvingList = [];

exports.doDissolve = function(roomId){
    var roomInfo = roomMgr.getRoom(roomId);
    if(roomInfo == null){
        return null;
    }

    var game = games[roomId];
    doGameOver(game,roomInfo.seats[0].userId,true);
};

exports.dissolveRequest = function(roomId,userId){
    var roomInfo = roomMgr.getRoom(roomId);
    if(roomInfo == null){
        return null;
    }

    if(roomInfo.dr != null){
        return null;
    }

    var seatIndex = roomMgr.getUserSeat(userId);
    if(seatIndex == null){
        return null;
    }

    roomInfo.dr = {
        endTime:Date.now() + 30000,
        states:[false,false,false,false,false]
    };
    roomInfo.dr.states[seatIndex] = true;

    dissolvingList.push(roomId);

    return roomInfo;
};

exports.dissolveAgree = function(roomId,userId,agree){
    var roomInfo = roomMgr.getRoom(roomId);
    if(roomInfo == null){
        return null;
    }

    if(roomInfo.dr == null){
        return null;
    }

    var seatIndex = roomMgr.getUserSeat(userId);
    if(seatIndex == null){
        return null;
    }

    if(agree){
        roomInfo.dr.states[seatIndex] = true;
    } else{
        roomInfo.dr = null;
        var idx = dissolvingList.indexOf(roomId);
        if(idx != -1){
            dissolvingList.splice(idx,1);
        }
    }
    return roomInfo;
};



function update() {
    for(var i = dissolvingList.length - 1; i >= 0; --i){
        var roomId = dissolvingList[i];

        var roomInfo = roomMgr.getRoom(roomId);
        if(roomInfo != null && roomInfo.dr != null){
            if(Date.now() > roomInfo.dr.endTime){
                console.log("delete room and games");
                exports.doDissolve(roomId);
                dissolvingList.splice(i,1);
            }
        }
        else{
            dissolvingList.splice(i,1);
        }
    }
}

setInterval(update,1000);
