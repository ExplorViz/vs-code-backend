import express from "express";
import { Server } from "socket.io";
import http from "http";
import dns from "dns";
import net from "net";
import {
  IDEApiActions,
  IDEApiCall,
  IDEApiDest,
  UserInfo,
  UserInfoInitPayload,
  RoomJoinPayload,
  TextSelection,
} from "./types";
import logger from "./logger";
import * as util from "util";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import {
  uniqueNamesGenerator,
  Config,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";

const customNamesGeneratorConfig: Config = {
  dictionaries: [adjectives, colors, animals],
  separator: "-",
  length: 3,
};

// Needing some custom data to be stored in a socket.
// TODO: Does every socket has its own data?
interface SocketData {
  roomName: string | undefined;
}

const backend = express();
let server: http.Server;
const maxHttpBufferSize = 1e8;
let io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const defaultPort = 3001;

const socketPath = "/v2/ide/";

let userInfoMap: Map<string, UserInfo> = new Map();

export function setupServer(port?: number) {
  if (server) {
    io.close();
  }

  userInfoMap = new Map();

  server = http.createServer(backend);

  if (!port) {
    port = defaultPort;
  }

  io = new Server(server, {
    maxHttpBufferSize: maxHttpBufferSize,
    path: socketPath,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    // If no 'pong' is received, the 'disconnect'-event is triggered.
    pingInterval: 5000,
  });

  logger.debug(
    "Max http buffer size for Socket data: " + maxHttpBufferSize / 1e6 + "mb"
  );

  io.on("connection", (socket) => {
    logger.trace(`Socket ${socket.id} connected.`);

    socket.on(
      "create-pair-programming-room",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (callback: any) => {
        const roomSubChannel = "pairprogramming";

        const uniqueRoomName = uniqueNamesGenerator(customNamesGeneratorConfig);

        const roomName = uniqueRoomName + ":" + roomSubChannel;
        socket.data.roomName = roomName;
        socket.join(roomName);

        logger.debug(
          `Socket ${socket.id} created and joined PP room ${uniqueRoomName}.`
        );

        if (callback) {
          callback(uniqueRoomName);
        }
      }
    );

    socket.on(
      "join-pair-programming-room",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (roomName: string, callback: any) => {
        const roomSubChannel = "pairprogramming";
        if (
          process.env.EXPERIMENT_MODE == "true" ||
          doesRoomExist(roomName + ":" + roomSubChannel)
        ) {
          socket.join(roomName + ":" + roomSubChannel);
          logger.debug(`Socket ${socket.id} joined PP room ${roomName}.`);

          if (callback) {
            callback(roomName);
          }
        } else {
          if (callback) {
            callback();
          }
        }
      }
    );

    socket.on(
      "broadcast-text-selection",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data: TextSelection, callback: any) => {
        const room = getPairProgrammingRoomSubchannelForSocketId(socket.id);

        if (room) {
          socket.broadcast.to(room).emit("receive-text-selection", data);

          if (callback) {
            callback(true);
          }
        } else {
          if (callback) {
            callback(false);
          }
        }

        /* if(room) {
          io.in("room1").fetchSockets().then((sockets) => {
            sockets.forEach((socket) => {
              if(socket.id.)
            });
          });
        }*/
      }
    );

    socket.on(
      "join-custom-room",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data: RoomJoinPayload, callback: any) => {
        if (!io.sockets.adapter.rooms.get(data.roomId + ":frontend")) {
          if (callback) {
            callback();
            return;
          }
        }

        const roomSubChannel = "ide";
        const roomToJoin = data.roomId + ":" + roomSubChannel;
        socket.data.roomName = roomToJoin;
        socket.join(roomToJoin);

        if (callback) {
          callback(data.roomId);
        }

        // send event to frontend, so that frontend knows that new ide joined
        // that needs data

        const room = getRoomWithSubchannelForSocketId(socket.id);
        if (room) {
          const oppositeRoom =
            getOppositeRoomWithSubchannelForGivenRoomName(room);

          if (oppositeRoom) {
            const getVizDataPayload = {
              action: IDEApiActions.GetVizData,
            };

            logger.debug(
              `Send event ${getVizDataPayload.action} from ${room} to ${oppositeRoom}`
            );

            socket.to(oppositeRoom).emit(IDEApiDest.VizDo, getVizDataPayload);
          }
        }

        logger.debug(`Socket ${socket.id} joined room ${roomToJoin}.`);
      }
    );

    socket.on(
      "update-user-info",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data: UserInfoInitPayload, callback: any) => {
        const foundUserId = userInfoMap.get(data.userId);
        const roomSubChannel = "frontend";

        let roomResponse = "";

        if (!foundUserId) {
          logger.trace(
            {
              event: util.inspect(socket.rooms),
            },
            "rooms obj before join"
          );

          const uniqueRoomName = uniqueNamesGenerator(
            customNamesGeneratorConfig
          );

          const roomName = uniqueRoomName + ":" + roomSubChannel;
          socket.data.roomName = roomName;
          socket.join(roomName);

          logger.debug(
            `Socket ${socket.id} with username ${data.userId} joined room ${
              uniqueRoomName + ":" + roomSubChannel
            }.`
          );

          logger.trace(
            { event: util.inspect(socket.rooms) },
            "rooms obj after join"
          );

          const newUserInfo: UserInfo = {
            userId: data.userId,
            room: uniqueRoomName,
            socketId: socket.id,
          };
          userInfoMap.set(data.userId, newUserInfo);
          roomResponse = uniqueRoomName;
        } else {
          const { room } = foundUserId;

          const updatedUserInfo: UserInfo = {
            userId: data.userId,
            room: room,
            socketId: socket.id,
          };

          const roomName = room + ":" + roomSubChannel;
          socket.data.roomName = roomName;
          socket.join(roomName);

          logger.debug(
            `Socket ${socket.id} with username ${data.userId} re-joined room ${
              room + ":" + roomSubChannel
            }.`
          );

          userInfoMap.set(data.userId, updatedUserInfo);
          roomResponse = room;
        }
        if (callback && roomResponse.length > 0) {
          callback(roomResponse);
        }
      }
    );

    socket.on(IDEApiDest.VizDo, (data: IDEApiCall) => {
      const room = getRoomWithSubchannelForSocketId(socket.id);
      if (room) {
        const oppositeRoom =
          getOppositeRoomWithSubchannelForGivenRoomName(room);

        if (oppositeRoom) {
          logger.debug(
            `Send event ${data.action} from ${room} to ${oppositeRoom}`
          );
          socket.to(oppositeRoom).emit(IDEApiDest.VizDo, data);
        }
      }
    });

    // Handle the case a client (unexpectedly) closes:
    socket.on('disconnect', (reason) => {
      logger.debug(
        "Socket " + socket.id + ': ' + reason
      );

      // NOTE: The socket.id gets removed from the adapter.sids after the 'disconnect'-event was handled!
      const room = socket.data.roomName; 
      if (room) {
        const oppositeRoom =
          getOppositeRoomWithSubchannelForGivenRoomName(room);

        if (oppositeRoom) {
          logger.debug(
            `A client from ${room} has closed the connection to ${oppositeRoom}`
          );

          // Has a frontend or an IDE closed?
          if (room.includes(":ide")) {
            socket.to(oppositeRoom).emit(IDEApiDest.VizDo, {
              action: IDEApiActions.DisconnectIDE,
              data: [],
              meshId: '',
              fqn: '',
              occurrenceID: -1,
              foundationCommunicationLinks: '',
            });

          } else if (room.includes(":frontend")) {
            socket.to(oppositeRoom).emit(IDEApiDest.IDEDo, {
              action: IDEApiActions.DisconnectFrontend,
              data: [],
              meshId: '',
              fqn: '',
              occurrenceID: -1,
              foundationCommunicationLinks: '',
            });
          } else {
            logger.debug('Connect_Error: Wrong room name ${room}.');
          }
        } else {
          logger.debug('No room found for socket ${socket.id}.');
        }
      }
    });

    socket.on(IDEApiDest.IDEDo, (data: IDEApiCall) => {
      const room = getRoomWithSubchannelForSocketId(socket.id);
      if (room) {
        const oppositeRoom =
          getOppositeRoomWithSubchannelForGivenRoomName(room);

        if (oppositeRoom) {
          logger.debug(
            `Send event ${data.action} from ${room} to ${oppositeRoom}`
          );
          socket.to(oppositeRoom).emit(IDEApiDest.IDEDo, data);
        }
      }
    });

    socket.on('check-frontend-connection', 
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (data: string, callback: any) => {
        const frontendHttp = data;
        logger.debug("check-frontend-connection frontendHttp: " + frontendHttp);
        const payload = await doesConnectionExist(frontendHttp);
        if(callback){
          callback(payload);
        }
    });

    socket.on('create-landscape', (callback) => {
      let payload = undefined;
      // TODO create landscape
      socket.emit('create-landscape', (tokenData: {id: string; secret: string;} | undefined) => {
        payload = tokenData;
      });

      if (callback) {
        payload ? callback(payload) : callback();
      }
    });
  });


  server.listen(port, "0.0.0.0", () => {
    logger.debug(`VS Code backend listening on port ${port}`);
  });
}


async function doesConnectionExist(frontendHttp: string) {
  console.log("doesConnectionExist called with " + frontendHttp);
  const frontendHttpIpv6Address = getIpv6Address(frontendHttp);
  logger.debug("resolved ip address: ", frontendHttpIpv6Address);
  if(!frontendHttpIpv6Address) {
    return false;
  }
  const sockets = await io.fetchSockets();
  sockets.forEach(socket => {
    const socketIpv6Address = getIpv6Address(JSON.stringify(socket.handshake.address));
    logger.debug("resolved socket address: ", socketIpv6Address);
    if(socketIpv6Address === frontendHttpIpv6Address) 
      return true;
  });
  return false;
}

function getIpv6Address(input: string): string | undefined {

  if (net.isIPv4(input))
    return '::ffff:' + input;

  if (net.isIPv6(input))
    return input;

  const temp = input.split(':');
  const inputWithoutPort = temp[temp.length-1];
  logger.debug("getIpv6Address of " + inputWithoutPort);
  if (net.isIPv4(inputWithoutPort))
    return '::ffff:' + inputWithoutPort;
    
  if (net.isIPv6(inputWithoutPort))
    return inputWithoutPort;
  
  try {
    const url = new URL(inputWithoutPort);
    const hostname = url.hostname;
    dns.lookup(hostname, 6, (err, address, ) => {
      if(err) {
        logger.debug("Couldn't resolve frontend url to ipv6 address: ", err.message);
        return;
      }
      return address;
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    } else {
      console.error("An unknown error occurred");
    }
    return;
  }
}

function doesRoomExist(roomName: string): boolean {
  return io.sockets.adapter.rooms.get(roomName) != undefined;
}

function getPairProgrammingRoomSubchannelForSocketId(socketId: string) {
  let room = "";

  const roomSet = io.sockets.adapter.sids.get(socketId)?.values();

  /* istanbul ignore next */
  if (!roomSet) {
    logger.error(
      `Room set for Socket ${socketId} is undefined, but shouldn't be. Event will not be emitted.`
    );
    return;
  }

  for (const roomName of roomSet) {
    if (roomName.includes(":pairprogramming")) {
      room = roomName;
      break;
    }
  }

  return room;
}

function getRoomWithSubchannelForSocketId(socketId: string) {
  let room = "";

  const roomSet = io.sockets.adapter.sids.get(socketId)?.values();

  /* istanbul ignore next */
  if (!roomSet) {
    logger.error(
      `Room set for Socket ${socketId} is undefined, but shouldn't be. Event will not be emitted.`
    );
    return;
  }

  for (const roomName of roomSet) {
    if (roomName.includes(":frontend") || roomName.includes(":ide")) {
      room = roomName;
      break;
    }
  }

  return room;
}

function getOppositeRoomWithSubchannelForGivenRoomName(
  roomWithSubchannel: string
) {
  if (roomWithSubchannel) {
    const oppositeRoom = roomWithSubchannel.includes(":frontend")
      ? roomWithSubchannel.replace(":frontend", ":ide")
      : roomWithSubchannel.replace(":ide", ":frontend");

    return oppositeRoom;
  } else {
    /* istanbul ignore next */
    return;
  }
}

setupServer();

export { backend, io, server, userInfoMap };
