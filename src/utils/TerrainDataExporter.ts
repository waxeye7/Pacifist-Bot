// terrainDataExporter.js

const TerrainDataExporter = () => {
  // Check if terrain data has been initialized
  if (!Memory.terrainDataInitialized) {
      // If lastProcessedCoord is undefined, set it to start the iteration
      if (!Memory.lastProcessedCoord) {
          Memory.lastProcessedCoord = { x: 0, y: 0 };
      }

      // Define how many rooms to process in each iteration
      const roomsPerIteration = 100;

      // Get the world size
      const worldSize = Game.map.getWorldSize();

      // Define the maximum coordinates to iterate
      const maxX = Math.floor(worldSize / 2);
      const maxY = Math.floor(worldSize / 2);

      // Initialize roomStatuses array in Memory if not exists
      Memory.roomStatuses = Memory.roomStatuses || [];

      // Iterate through rooms based on the last processed coordinate
      for (let i = 0; i < roomsPerIteration; i++) {
          const x = Memory.lastProcessedCoord.x;
          const y = Memory.lastProcessedCoord.y;

          for (let horizontalDirection of ['E', 'W']) {
              for (let verticalDirection of ['N', 'S']) {
                  const roomName = `${horizontalDirection}${x}${verticalDirection}${y}`;

                  const roomStatus = Game.map.getRoomStatus(roomName);

                  // Update existing or add new room status in Memory
                  const existingStatus = Memory.roomStatuses.find(status => status.roomName === roomName);

                  if (existingStatus) {
                      // Merge new status with existing status
                      existingStatus.status = roomStatus.status;
                  } else {
                      // Add new room status to the array
                      Memory.roomStatuses.push({
                          roomName: roomName,
                          status: roomStatus.status,
                      });
                  }

                  // Log room status for debugging
                  console.log(`Room: ${roomName}, Status: ${roomStatus.status}`);
              }
          }

          // Update the last processed coordinate
          Memory.lastProcessedCoord.x++;

          // If x exceeds maxX, reset x, increment y
          if (Memory.lastProcessedCoord.x > maxX) {
              Memory.lastProcessedCoord.x = 0;
              Memory.lastProcessedCoord.y++;
          }

          // If y exceeds maxY, set a flag indicating that terrain data has been initialized
          if (Memory.lastProcessedCoord.y > maxY) {
              Memory.terrainDataInitialized = true;
              break;
          }
      }

      // Console log the progress
      console.log(`Processed ${Memory.lastProcessedCoord.x * (maxY + 1) + Memory.lastProcessedCoord.y + 1} rooms.`);
  }
};

export default TerrainDataExporter;
