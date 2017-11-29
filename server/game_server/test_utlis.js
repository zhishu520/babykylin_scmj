
var utils = require("./bjutils");


function one_str(a){

    var suitChars = ['♥','♠','♦','♣'];
    var numberChars = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    var suit = a >> 8;
    var number = utils.getNumber(a);
    return suitChars[suit]+ numberChars[number - 1];
}

function print_compare(a1,a2,a3,b1,b2,b3){
    var a = utils.sort3card([a1,a2,a3]);
    var b = utils.sort3card([b1,b2,b3]);

    a1 = a[0]; a2 = a[1]; a3 = a[2];
    b1 = b[0]; b2 = b[1]; b3 = b[2];

    var aStr = one_str(a1) + one_str(a2) + one_str(a3);
    var bStr = one_str(b1) + one_str(b2) + one_str(b3);

    if (utils.compare([a1,a2,a3],[b1,b2,b3])) {
        console.log(aStr + " > " + bStr);
    }else{
        console.log(aStr + " < " + bStr);
    }
}


/*
function random_card ()
    local random_suit = math.random(0,3);
    local random_num = math.random(13);

    local num = random_suit * 256 + random_num
    return num
end

math.randomseed(os.time())
*/


//♥ A♠ A♣ A > ♥ 2♠ 2♣ 2
print_compare(1,256+1,3*256+1, 2,256+2,3*256+2);
//♥ 3♠ 3♣ 3 > ♥ 2♠ 2♣ 2
print_compare(0*256+3,1*256+3,3*256+3, 0*256+2,1*256+2,3*256+2)
//♥ A♠ A♣ A > ♥ 2♥ 3♥ 4
print_compare(0*256+1,1*256+1,3*256+1, 0*256+2,0*256+3,0*256+4)
//♥ 2♥ 3♥ 4 > ♥ A♥ 2♥ 3
print_compare(0*256+2,0*256+3,0*256+4, 0*256+1,0*256+2,0*256+3)
//♥ Q♥ K♥ A > ♥ A♥ 2♥ 3
print_compare(0*256+12,0*256+13,0*256+1, 0*256+11,0*256+12,0*256+13)
//♥ A♥ 4♥ 2 > ♥ Q♠ K♣ A
print_compare(0*256+1,0*256+2,0*256+4, 0*256+12,1*256+13,3*256+1)
//♥ A♥ 2♥ 3 > ♥ Q♠ K♣ A
print_compare(0*256+1,0*256+2,0*256+3, 0*256+12,1*256+13,3*256+1)
//♥ A♥ 2♥ 3 > ♥ A♥ 5♥ 4
print_compare(0*256+1,0*256+2,0*256+3, 0*256+1,0*256+4,0*256+5)
//♥ A♥ 2♥ 3 > ♥ A♥ 5♥ 4
print_compare(0*256+1,2*256+2,3*256+3, 0*256+1,1*256+4,2*256+1)
//♥ A♥ 2♥ 3 > ♥ Q♠ K♣ A
//print_compare(0*256+1,2*256+2,2*256+3, 0*256+4,1*256+4,2*256+5)
//print_compare(0*256+4,1*256+4,2*256+5, 0*256+1,1*256+9,2*256+8)
//print_compare(0*256+1,1*256+9,2*256+8, 1*256+1,2*256+9,3*256+8)

