var bjutils = require("./bjutils");


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
}

var roomInfo = {};
roomInfo.conf = {};
roomInfo.conf.baseScore = 1;

var game = {};
game.gameSeats = new Array(5);

for(var i = 0;i < 5; i++){
    game.gameSeats[i] = {};
    game.gameSeats[i].userId = i;
    game.gameSeats[i].score = 0;
}

game.gameSeats[1].holds = [1,256+1,3*256+1, 1,256+1,3*256+1,1,256+1,3*256+1];
game.gameSeats[2].holds = [2,256+2,3*256+2, 2,256+2,3*256+2,2,256+2,3*256+2];
game.gameSeats[3].holds = [3,256+3,3*256+3, 3,256+3,3*256+3,3,256+3,3*256+3];
game.gameSeats[4].holds = [4,256+4,3*256+4, 4,256+4,3*256+4,4,256+4,3*256+4];

calculateResult(game,roomInfo);

for(var i = 0;i < 5; i++){
    console.log(game.gameSeats[i].score);
}
