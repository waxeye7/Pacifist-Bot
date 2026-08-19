db = db.getSiblingDB("screeps");
var names = /EnergyMiner-.*-(E5S3|E12S3|E18S9|E11S6|E16S9|E18S5|E12S1|E13S7)$/;
var miners = db["rooms.objects"].find({type:"creep", name: names}, {
  name:1, room:1, x:1, y:1, body:1, spawning:1, memory:1, ageTime:1, user:1
}).toArray();
function partsOf(body) {
  var m = {};
  if (!body) return m;
  for (var i = 0; i < body.length; i++) {
    var p = body[i];
    var t = typeof p === "string" ? p : (p && p.type);
    if (!t) continue;
    t = String(t).toLowerCase();
    m[t] = (m[t] || 0) + 1;
  }
  return m;
}
function bodyStr(parts) {
  var order = ["work","carry","move"];
  var out = [];
  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (parts[k]) out.push(parts[k] + k[0].toUpperCase());
  }
  return out.join("") || "?";
}
var out = miners.map(function(o){
  var p = partsOf(o.body);
  var mem = o.memory || {};
  return {
    name: o.name, room: o.room, spawning: !!o.spawning,
    body: bodyStr(p), w: p.work||0, sourceId: mem.sourceId||null,
    targetRoom: mem.targetRoom||null, homeRoom: mem.homeRoom||null, ttl: o.ageTime||null
  };
});
var e18 = db["rooms.objects"].find({room:"E18S5", type:{$in:["container","constructionSite","spawn","extension","tombstone","ruin","creep"]}}, {type:1,x:1,y:1,store:1,structureType:1,progress:1,progressTotal:1,name:1,storeCapacity:1}).toArray();
var e5 = db["rooms.objects"].find({room:"E5S3", type:{$in:["container","constructionSite","spawn","tombstone","ruin"]}}, {type:1,x:1,y:1,store:1,structureType:1,progress:1,name:1}).toArray();
var cons = db["users.console"].find({user:{$in:["pacifist1","pacifist"]}}).sort({$natural:-1}).limit(5).toArray();
var notes = db["users.notifications"].find({user:"pacifist1"}).sort({_id:-1}).limit(8).toArray();
print("__B__" + JSON.stringify({miners: out, e18: e18, e5: e5, consN: cons.length, notes: notes.map(function(n){return {t:n.tick||n.date, msg:(n.message||n.text||JSON.stringify(n)).slice(0,200)};})}));
