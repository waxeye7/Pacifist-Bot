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

    if(Game.time % 100 == 0) {
        let total = 0;
        let lengthOfHundredArray = Memory.CPU.hundredTickAvg.data.length;
        for(let num of Memory.CPU.hundredTickAvg.data) {
          total += Number(num);
        }
        let average = (total / lengthOfHundredArray).toFixed(2);

        Memory.CPU.hundredTickAvg.avg = average;
        console.log("hundred tick average is " + average)
        Memory.CPU.hundredTickAvg.data = [];


        Memory.CPU.fiveHundredTickAvg.data.push(average)
        if(Game.time % 500 == 0) {

          let total = 0;
          let lengthOfFiveHundredArray = Memory.CPU.fiveHundredTickAvg.data.length;
          for(let num of Memory.CPU.fiveHundredTickAvg.data) {
            total += Number(num);
          }
          let average = (total / lengthOfFiveHundredArray).toFixed(2);

          Memory.CPU.fiveHundredTickAvg.avg = average;
          console.log("five hundred tick average is " + average)
          Memory.CPU.fiveHundredTickAvg.data = [];

        }
    }


    if(Game.time % 5 == 0) {
      console.log("my bucket:", Game.cpu.bucket)
    }
}

export default CPUmanager;
