db = db.getSiblingDB("screeps");
var src = db["rooms.objects"].aggregate([
  {$match:{type:"source"}},
  {$group:{_id:"$room", n:{$sum:1}}},
  {$match:{n:{$gte:2}}}
]).toArray().map(x=>x._id);
var ctrl = db["rooms.objects"].distinct("room", {type:"controller"});
var claim = src.filter(r => ctrl.indexOf(r) >= 0).sort();
print(JSON.stringify(claim));
