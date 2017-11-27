var roomMgr = require("./roommgr");
var userMgr = require("./usermgr");
var mjutils = require('./mjutils');
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

    // c 表示花色， i表示牌
    var index = 0;
    for(var i = 1; i <= 13; ++i){
        for(var c = 0; c < 4; ++c){
            cards[index] = c*256 + i;
            index++;
        }
    }

    for (var k = 0; k < 10; k++) {
        for (var i = 0; i < cards.length; ++i) {
            var lastIndex = cards.length - 1 - i;
            var index = Math.floor(Math.random() * lastIndex);

            var t = cards[index];
            cards[index] = cards[lastIndex];
            cards[lastIndex] = t;
        }
    }
}

function mopai(game,seatIndex) {
    if(game.currentIndex == game.mahjongs.length){
        return -1;
    }
    var data = game.gameSeats[seatIndex];
    var mahjongs = data.holds;
    var pai = game.mahjongs[game.currentIndex];
    mahjongs.push(pai);

    //统计牌的数目 ，用于快速判定（空间换时间）
    var c = data.countMap[pai];
    if(c == null) {
        c = 0;
    }
    data.countMap[pai] = c + 1;
    game.currentIndex ++;
    return pai;
}

function deal(game){
    //每人13张 一共 13*4 ＝ 52张 庄家多一张 53张
    var seatIndex = game.button;
    for(var i = 0; i < 52; ++i){
        var mahjongs = game.gameSeats[seatIndex].holds;
        if(mahjongs == null){
            mahjongs = [];
            game.gameSeats[seatIndex].holds = mahjongs;
        }
        mopai(game,seatIndex);

        seatIndex ++;
        seatIndex %= 4;
    }

    //当前轮设置为庄家
    game.turn = game.button;
}

function clearAllOptions(game,seatData){
    var fnClear = function(sd){
        sd.canPeng = false;
        sd.canGang = false;
        sd.gangPai = [];
        sd.canHu = false;
        sd.lastFangGangSeat = -1;    
    }
    if(seatData){
        fnClear(seatData);
    }
    else{
        game.qiangGangContext = null;
        for(var i = 0; i < game.gameSeats.length; ++i){
            fnClear(game.gameSeats[i]);
        }
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

function hasOperations(seatData){
    if(seatData.canGang || seatData.canPeng || seatData.canHu){
        return true;
    }
    return false;
}

function sendOperations(game,seatData,pai) {
    if(hasOperations(seatData)){
        if(pai == -1){
            pai = seatData.holds[seatData.holds.length - 1];
        }
        
        var data = {
            pai:pai,
            hu:seatData.canHu,
            peng:seatData.canPeng,
            gang:seatData.canGang,
            gangpai:seatData.gangPai
        };

        //如果可以有操作，则进行操作
        userMgr.sendMsg(seatData.userId,'game_action_push',data);

        data.si = seatData.seatIndex;
    }
    else{
        userMgr.sendMsg(seatData.userId,'game_action_push');
    }
}


function calculateResult(game,roomInfo){
    var isNeedChaDaJia = needChaDaJiao(game);
    if(isNeedChaDaJia){
        chaJiao(game);
    }
    
    var baseScore = game.conf.baseScore;
    
    for(var i = 0; i < game.gameSeats.length; ++i){
        var sd = game.gameSeats[i];
        //对所有胡牌的玩家进行统计
        if(isTinged(sd)){
            //收杠钱
            var additonalscore = 0;
            for(var a = 0; a < sd.actions.length; ++a){
                var ac = sd.actions[a];
                if(ac.type == "fanggang"){
                    var ts = game.gameSeats[ac.targets[0]];
                    //检查放杠的情况，如果目标没有和牌，且没有叫牌，则不算 用于优化前端显示
                    if(isNeedChaDaJia && (ts.hued) == false && (isTinged(ts) == false)){
                        ac.state = "nop";
                    }
                }
                else if(ac.type == "angang" || ac.type == "wangang" || ac.type == "diangang"){
                    if(ac.state != "nop"){
                        var acscore = ac.score;
                        additonalscore += ac.targets.length * acscore * baseScore;
                        //扣掉目标方的分
                        for(var t = 0; t < ac.targets.length; ++t){
                            var six = ac.targets[t];
                            game.gameSeats[six].score -= acscore * baseScore;
                        }                   
                    }
                }
                else if(ac.type == "maozhuanyu"){
                    //对于呼叫转移，如果对方没有叫牌，表示不得行
                    if(isTinged(ac.owner)){
                        //如果
                        var ref = ac.ref;
                        var acscore = ref.score;
                        var total = ref.targets.length * acscore * baseScore;
                        additonalscore += total;
                        //扣掉目标方的分
                        if(ref.payTimes == 0){
                            for(var t = 0; t < ref.targets.length; ++t){
                                var six = ref.targets[t];
                                game.gameSeats[six].score -= acscore * baseScore;
                            }                            
                        }
                        else{
                            //如果已经被扣过一次了，则由杠牌这家赔
                            ac.owner.score -= total;
                        }
                        ref.payTimes++;
                        ac.owner = null;
                        ac.ref = null;
                    }
                }
            }
            
            if(isQingYiSe(sd)){
                sd.qingyise = true;
            }
            
            if(game.conf.menqing){
                sd.isMenQing = isMenQing(sd);                
            }
            
            //金钩胡
            if(sd.holds.length == 1 || sd.holds.length == 2){
                sd.isJinGouHu = true;
            }
            
            sd.numAnGang = sd.angangs.length;
            sd.numMingGang = sd.wangangs.length + sd.diangangs.length;
            
            //进行胡牌结算
            for(var j = 0; j < sd.huInfo.length; ++j){
                var info = sd.huInfo[j];
                if(!info.ishupai){
                    sd.numDianPao++;
                    continue;
                }
                //统计自己的番子和分数
                //基础番(平胡0番，对对胡1番、七对2番) + 清一色2番 + 杠+1番
                //杠上花+1番，杠上炮+1番 抢杠胡+1番，金钩胡+1番，海底胡+1番
                var fan = info.fan;
                sd.holds.push(info.pai);
                if(sd.countMap[info.pai] != null){
                    sd.countMap[info.pai] ++;
                }
                else{
                    sd.countMap[info.pai] = 1;
                }
                
                if(sd.qingyise){
                    fan += 2;
                }
                
                //金钩胡
                if(sd.isJinGouHu){
                    fan += 1;
                }
                
                if(info.isHaiDiHu){
                    fan += 1;
                }
                
                if(game.conf.tiandihu){
                    if(info.isTianHu){
                        fan += 3;
                    }
                    else if(info.isDiHu){
                        fan += 2;
                    }
                }
                
                var isjiangdui = false;
                if(game.conf.jiangdui){
                    if(info.pattern == "7pairs"){
                        if(info.numofgen > 0){
                            info.numofgen -= 1;
                            info.pattern == "l7pairs";
                            isjiangdui = isJiangDui(sd);
                            if(isjiangdui){
                                info.pattern == "j7paris";
                                fan += 2;    
                            }   
                            else{
                                fan += 1;
                            }
                        }
                    }
                    else if(info.pattern == "duidui"){
                        isjiangdui = isJiangDui(sd);
                        if(isjiangdui){
                            info.pattern = "jiangdui";
                            fan += 2;   
                        }
                    }   
                }
                
                
                fan += info.numofgen;
                
                if(info.action == "ganghua" || info.action == "dianganghua" || info.action == "gangpaohu" || info.action == "qiangganghu"){
                    fan += 1;
                }
                
                var extraScore = 0;
                if(info.iszimo){
                    if(game.conf.zimo == 0){
                        //自摸加底
                        extraScore = baseScore;
                    }
                    else if(game.conf.zimo == 1){
                        fan += 1;
                    }
                    else{
                        //nothing.
                    }
                }
                //和牌的玩家才加这个分
                var score = computeFanScore(game,fan) + extraScore;
                if(info.action == "chadajiao"){
                    //收所有没有叫牌的人的钱
                    for(var t = 0; t < game.gameSeats.length; ++t){
                        if(!isTinged(game.gameSeats[t])){
                            game.gameSeats[t].score -= score;
                            sd.score += score;
                            //被查叫次数
                            if(game.gameSeats[t] != sd){
                                game.gameSeats[t].numChaJiao++;    
                            }           
                        }
                    }
                }
                else if(info.iszimo){
                    //收所有人的钱
                    sd.score += score * game.gameSeats.length;
                    for(var t = 0; t < game.gameSeats.length; ++t){
                        game.gameSeats[t].score -= score;
                    }
                    sd.numZiMo++;
                }
                else{
                    //收放炮者的钱
                    sd.score += score;
                    game.gameSeats[info.target].score -= score;
                    sd.numJiePao++;
                }
                
                //撤除胡的那张牌
                sd.holds.pop();
                sd.countMap[info.pai]--;
                
                if(fan > game.conf.maxFan){
                    fan = game.conf.maxFan;
                }
                info.fan = fan;
            }
            //一定要用 += 。 因为此时的sd.score可能是负的
            sd.score += additonalscore;
        }
        else{
            for(var a = sd.actions.length -1; a >= 0; --a){
                var ac = sd.actions[a];
                if(ac.type == "angang" || ac.type == "wangang" || ac.type == "diangang"){
                    //如果3家都胡牌，则需要结算。否则认为是查叫
                    if(isNeedChaDaJia){
                        sd.actions.splice(a,1);                        
                    }
                    else{
                        if(ac.state != "nop"){
                            var acscore = ac.score;
                            sd.score += ac.targets.length * acscore * baseScore;
                            //扣掉目标方的分
                            for(var t = 0; t < ac.targets.length; ++t){
                                var six = ac.targets[t];
                                game.gameSeats[six].score -= acscore * baseScore;
                            }                   
                        }   
                    }
                }
            }
        }
    }
}

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
    var dbresult = [0,0,0,0];
    
    var fnNoticeResult = function(isEnd){
        var endinfo = null;
        if(isEnd){
            endinfo = [];
            for(var i = 0; i < roomInfo.seats.length; ++i){
                var rs = roomInfo.seats[i];
                endinfo.push({
                    numzimo:rs.numZiMo,
                    numjiepao:rs.numJiePao,
                    numdianpao:rs.numDianPao,
                    numangang:rs.numAnGang,
                    numminggang:rs.numMingGang,
                    numchadajiao:rs.numChaJiao, 
                });
            }   
        }
        
        userMgr.broacastInRoom('game_over_push',{results:results,endinfo:endinfo},userId,true);
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
            rs.numZiMo += sd.numZiMo;
            rs.numJiePao += sd.numJiePao;
            rs.numDianPao += sd.numDianPao;
            rs.numAnGang += sd.numAnGang;
            rs.numMingGang += sd.numMingGang;
            rs.numChaJiao += sd.numChaJiao;
            
            var userRT = {
                userId:sd.userId,
                actions:[],
                pengs:sd.pengs,
                wangangs:sd.wangangs,
                diangangs:sd.diangangs,
                angangs:sd.angangs,
                holds:sd.holds,
                score:sd.score,
                totalscore:rs.score,
                qingyise:sd.qingyise,
                menqing:sd.isMenQing,
                jingouhu:sd.isJinGouHu,
                huinfo:sd.huInfo,                
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

        var old = roomInfo.nextButton;
        if(game.yipaoduoxiang >= 0){
            roomInfo.nextButton = game.yipaoduoxiang;
        }
        else if(game.firstHupai >= 0){
            roomInfo.nextButton = game.firstHupai;
        }
        else{
            roomInfo.nextButton = (game.turn + 1) % 4;
        }

        if(old != roomInfo.nextButton){
            db.update_next_button(roomId,roomInfo.nextButton);
        }
    }
    
    if(forceEnd || game == null){
        fnNoticeResult(true);   
    }
    else{
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
                var cost = 2;
                if(roomInfo.conf.maxGames == 8){
                    cost = 3;
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
            if(i != seatData.seatIndex/* && s.hued == false*/){
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
        if(roomInfo.seats.length == 4){
            for(var i = 0; i < roomInfo.seats.length; ++i){
                var s = roomInfo.seats[i];
                if(s.ready == false || userMgr.isOnline(s.userId)==false){
                    return;
                }
            }
            //4个人到齐了，并且都准备好了，则开始新的一局
            exports.begin(roomId);
        }
    }
    else{
        var numOfMJ = game.mahjongs.length - game.currentIndex;
        var remainingGames = roomInfo.conf.maxGames - roomInfo.numOfGames;

        var data = {
            state:game.state,
            numofmj:numOfMJ,
            button:game.button,
            turn:game.turn,
            chuPai:game.chuPai,
        };

        data.seats = [];
        var seatData = null;
        for(var i = 0; i < 4; ++i){
            var sd = game.gameSeats[i];

            var s = {
                userid:sd.userId,
                folds:sd.folds,
                angangs:sd.angangs,
                diangangs:sd.diangangs,
                wangangs:sd.wangangs,
                pengs:sd.pengs,
                que:sd.que,
                hued:sd.hued,
                huinfo:sd.huInfo,
                iszimo:sd.iszimo,
            }
            if(sd.userId == userId){
                s.holds = sd.holds;
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
        sendOperations(game,seatData,game.chuPai);
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
        seats:new Array(4)
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
        game_seats:new Array(4)
    }
    for(var i = 0; i < 4; ++i){
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

        button:roomInfo.nextButton,
        cards: new Array(52),
        currentIndex:0,
        gameSeats:new Array(5),

        numOfQue:0,
        turn:0,
        chuPai:-1,
        state:"idle",
        firstHupai:-1,
        yipaoduoxiang:-1,
        fangpaoshumu:-1,
        actionList:[],
        chupaiCnt:0,
    };

    roomInfo.numOfGames++;

    for(var i = 0; i < 4; ++i){
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

    

    var numOfMJ = game.mahjongs.length - game.currentIndex;
    var huansanzhang = roomInfo.conf.hsz;

    for(var i = 0; i < seats.length; ++i){
        //开局时，通知前端必要的数据
        var s = seats[i];
        //通知玩家手牌
        userMgr.sendMsg(s.userId,'game_holds_push',game.gameSeats[i].holds);
        //通知还剩多少张牌
        userMgr.sendMsg(s.userId,'mj_count_push',numOfMJ);
        //通知还剩多少局
        userMgr.sendMsg(s.userId,'game_num_push',roomInfo.numOfGames);
        //通知游戏开始
        userMgr.sendMsg(s.userId,'game_begin_push',game.button);

        if(huansanzhang == true){
            game.state = "huanpai";
            //通知准备换牌
            userMgr.sendMsg(s.userId,'game_huanpai_push');
        }
        else{
            game.state = "dingque";
            //通知准备定缺
            userMgr.sendMsg(s.userId,'game_dingque_push');
        }
    }
};

exports.chuPai = function(userId,pai){

    pai = Number.parseInt(pai);
    var seatData = gameSeatsOfUsers[userId];
    if(seatData == null){
        console.log("can't find user game data.");
        return;
    }

    var game = seatData.game;
    var seatIndex = seatData.seatIndex;
    //如果不该他出，则忽略
    if(game.turn != seatData.seatIndex){
        console.log("not your turn.");
        return;
    }

    if(seatData.canChuPai == false){
        console.log('no need chupai.');
        return;
    }

    if(hasOperations(seatData)){
        console.log('plz guo before you chupai.');
        return;
    }
    
    //如果是胡了的人，则只能打最后一张牌
    if(seatData.hued){
        if(seatData.holds[seatData.holds.length - 1] != pai){
            console.log('only deal last one when hued.');
            return;
        }
    }

    //从此人牌中扣除
    var index = seatData.holds.indexOf(pai);
    if(index == -1){
        console.log("holds:" + seatData.holds);
        console.log("can't find mj." + pai);
        return;
    }
    
    seatData.canChuPai = false;
    game.chupaiCnt ++;
    seatData.guoHuFan = -1;
    
    seatData.holds.splice(index,1);
    seatData.countMap[pai] --;
    game.chuPai = pai;
    recordGameAction(game,seatData.seatIndex,ACTION_CHUPAI,pai);
    checkCanTingPai(game,seatData);
    userMgr.broacastInRoom('game_chupai_notify_push',{userId:seatData.userId,pai:pai},seatData.userId,true);
    
    //如果出的牌可以胡，则算过胡
    if(seatData.tingMap[game.chuPai]){
        seatData.guoHuFan = seatData.tingMap[game.chuPai].fan;
    }

    //检查是否有人要胡，要碰 要杠
    var hasActions = false;
    for(var i = 0; i < game.gameSeats.length; ++i){
        //玩家自己不检查
        if(game.turn == i){
            continue;
        }
        var ddd = game.gameSeats[i];
        //未胡牌的才检查杠和碰
        if(!ddd.hued){
            checkCanPeng(game,ddd,pai);
            checkCanDianGang(game,ddd,pai);            
        }

        checkCanHu(game,ddd,pai);
        if(seatData.lastFangGangSeat == -1){
            if(ddd.canHu && ddd.guoHuFan >= 0 && ddd.tingMap[pai].fan <= ddd.guoHuFan){
                console.log("ddd.guoHuFan:" + ddd.guoHuFan);
                ddd.canHu = false;
                userMgr.sendMsg(ddd.userId,'guohu_push');            
            }     
        }

        if(hasOperations(ddd)){
            sendOperations(game,ddd,game.chuPai);
            hasActions = true;    
        }
    }
    
    //如果没有人有操作，则向下一家发牌，并通知他出牌
    if(!hasActions){
        setTimeout(function(){
            userMgr.broacastInRoom('guo_notify_push',{userId:seatData.userId,pai:game.chuPai},seatData.userId,true);
            seatData.folds.push(game.chuPai);
            game.chuPai = -1;
            moveToNextUser(game);
            doUserMoPai(game);            
        },500);
    }
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
        states:[false,false,false,false]
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
    }
    else{
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