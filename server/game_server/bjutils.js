
function getSuits(value) {
    //return value & 0xf00;
    return parseInt(value / 256, 10) * 256;
}

function getNumber(value){
    //return value & 0x0ff;
    return value % 256;
}

function isSanTiao(a, b, c) {
    var numberA = getNumber(a);
    var numberB = getNumber(b);
    var numberC = getNumber(c);
    return numberA === numberB && numberA === numberC;
}

function isTongHua(a, b, c) {
    var suitA = getSuits(a);
    var suitB = getSuits(b);
    var suitC = getSuits(c);
    return suitA === suitB && suitA === suitC;
}

function isShunZi(a, b, c) {
    var numberA = getNumber(a);
    var numberB = getNumber(b);
    var numberC = getNumber(c);
    return (numberA === numberB - 1 && numberA === numberC - 2) ||
        (numberA === numberB + 1 && numberA === numberC + 2) ||
        (numberA === 14 && numberB === 3 && numberC === 2); // A23
}

function isTongHuaShun(a,b,c) {
    return isTongHua(a, b, c) && isShunZi(a, b, c);
}

function isDuiZi(a, b, c) {
    var numberA = getNumber(a);
    var numberB = getNumber(b);
    var numberC = getNumber(c);
    return numberA === numberB || numberA === numberC || numberB === numberC;
}


function dealA(array) {
    var a = array[0]; var b = array[1]; var c = array[2];
    if (getNumber(a) === 1){ a = getSuits(a) + 14; }
    if (getNumber(b) === 1){ b = getSuits(b) + 14; }
    if (getNumber(c) === 1){ c = getSuits(c) + 14; }
    return [a, b, c];
}

function sort3card(array){
    array = dealA(array);

    var a = array[0]; var b = array[1]; var c = array[2];
    var an = getNumber(a); var bn = getNumber(b); var cn = getNumber(c);

    var temp;
    if (an < bn) {
        temp = a; a=b; b=temp;
        temp = an; an=bn; bn=temp;
    }
    if (an < cn) {
        temp = a; a=c; c=temp;
        temp = an; an=cn; cn=temp;
    }

    if (bn < cn) {
        temp = b; b=c; c=temp;
        temp = bn; bn=cn; cn=temp;
    }

    if (an === 14 && bn === 3 && cn === 2) { //A23
        a = getSuits(a) + 1;
        b = getSuits(b) + 2;
        c = getSuits(c) + 3;
    }else if (isShunZi(a, b, c)){
        temp = a; a = b; b = c; c = temp;
    }

    if (!isSanTiao(a, b, c)) {
        if (an === cn) {
            temp = b; b=c; c=temp;
            temp = bn; bn=cn; cn=temp;
        } else if (bn === cn) {
            temp = a; a=c; c=temp;
            temp = an; an=cn; cn=temp;
        }
        if (an === bn && getSuits(a) > getSuits(b)) {
            temp = a; a=b; b=temp;
        }
    }
    return [a, b, c];
}

function compareNumber(a1, a2, a3, b1, b2, b3) {
    var an1 = getNumber(a1);
    var an2 = getNumber(a2);
    var an3 = getNumber(a3);
    var bn1 = getNumber(b1);
    var bn2 = getNumber(b2);
    var bn3 = getNumber(b3);
    var numValueA = an1 * 400 + an2 * 20 + an3;
    var numValueB = bn1 * 400 + bn2 * 20 + bn3;

    if (numValueA === numValueB) {
        return getSuits(a1) < getSuits(b1);
    }

    return numValueA > numValueB;
}

function compareResult(resultA, resultB) {
    var needReturn, result;
    if (resultA && resultB) {
        needReturn = false;
        result = true;
    } else if (!resultA && !resultB) {
        needReturn = false;
        result = false;
    } else if (resultA) {
        needReturn = true;
        result = true;
    } else if (resultB){
        needReturn = true;
        result = false;
    }
    return [needReturn, result];
}

exports.compare = function(g1,g2){
    var ret;
    g1 = sort3card(g1);
    g2 = sort3card(g2);

    var a1 = g1[0]; var a2 = g1[1]; var a3 = g1[2];
    var b1 = g2[0]; var b2 = g2[1]; var b3 = g2[2];

    var result = compareResult(isSanTiao(a1,a2,a3), isSanTiao(b1,b2,b3));
    if (result[0]) { ret = result[1];} else if (result[1]) { ret = compareNumber(a1,a2,a3,b1,b2,b3);} if(ret) {return ret;}

    result = compareResult(isTongHuaShun(a1,a2,a3), isTongHuaShun(b1,b2,b3));
    if (result[0]) { ret = result[1];} else if (result[1]) { ret = compareNumber(a1,a2,a3,b1,b2,b3);} if(ret) {return ret;}

    result = compareResult(isTongHua(a1,a2,a3), isTongHua(b1,b2,b3));
    if (result[0]) { ret = result[1];} else if (result[1]) { ret = compareNumber(a1,a2,a3,b1,b2,b3);} if(ret) {return ret;}

    result = compareResult(isShunZi(a1,a2,a3), isShunZi(b1,b2,b3));
    if (result[0]) { ret = result[1];} else if (result[1]) { ret = compareNumber(a1,a2,a3,b1,b2,b3);} if(ret) {return ret;}

    result = compareResult(isDuiZi(a1,a2,a3), isDuiZi(b1,b2,b3));
    if (result[0]) { ret = result[1];} else if (result[1]) { ret = compareNumber(a1,a2,a3,b1,b2,b3);} if(ret) {return ret;}

    return compareNumber(a1,a2,a3,b1,b2,b3);
};

exports.getNumber = getNumber;
exports.sort3card = sort3card;
