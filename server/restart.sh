#!/bin/sh
ID=`ps -ef | grep "configs_mac.js" | grep -v "grep" | awk '{print $2}'`  
echo $ID
echo "---------------"
for id in $ID  
do  
kill -9 $id  
echo "killed $id"  
done  
echo "---------------"  

nohup node ./account_server/app.js ../configs_mac.js &
nohup node ./hall_server/app.js ../configs_mac.js &
nohup node ./game_server/app.js ../configs_mac.js &

