function CPUmanager(tickTotal) {


    if(!Memory.CPU) {
        Memory.CPU = {};
      }
      if(!Memory.CPU.hundredTickAvg) {
        Memory.CPU.hundredTickAvg = {};
        Memory.CPU.hundredTickAvg.data = [];
        Memory.CPU.hundredTickAvg.avg = 0;
      }
      if(!Memory.CPU.fiveHundredTickAvg) {
        Memory.CPU.fiveHundredTickAvg = {};
        Memory.CPU.fiveHundredTickAvg.data = [];
        Memory.CPU.fiveHundredTickAvg.avg = 0;
      }

    Memory.CPU.hundredTickAvg.data.push(tickTotal)
    Memory.CPU.lastTick = tickTotal;
    Memory.CPU.limit = Game.cpu.limit;
    Memory.CPU.bucket = Game.cpu.bucket;

    if(Game.time % 100 == 0) {
        let total = 0;
        let lengthOfHundredArray = Memory.CPU.hundredTickAvg.data.length;
        for(let num of Memory.CPU.hundredTickAvg.data) {
          total += Number(num);
        }
        // keep numeric avg (was string via toFixed — broke remote comparisons)
        let average = lengthOfHundredArray ? total / lengthOfHundredArray : 0;

        Memory.CPU.hundredTickAvg.avg = average;
        console.log("hundred tick average is " + average.toFixed(2))
        Memory.CPU.hundredTickAvg.data = [];


        Memory.CPU.fiveHundredTickAvg.data.push(average)
        if(Game.time % 500 == 0) {

          let total = 0;
          let lengthOfFiveHundredArray = Memory.CPU.fiveHundredTickAvg.data.length;
          for(let num of Memory.CPU.fiveHundredTickAvg.data) {
            total += Number(num);
          }
          let average = lengthOfFiveHundredArray ? total / lengthOfFiveHundredArray : 0;

          Memory.CPU.fiveHundredTickAvg.avg = average;
          console.log("five hundred tick average is " + average.toFixed(2))
          Memory.CPU.fiveHundredTickAvg.data = [];

        }
    }


    // was every 5 ticks — only when verbose
    if(Game.time % 50 == 0) {
      console.log("my bucket:", Game.cpu.bucket, "limit:", Game.cpu.limit)
    }
}

export default CPUmanager;
