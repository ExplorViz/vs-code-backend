import express from "express";
import { Server } from "socket.io";
import http from "http";
import dns from "dns";
import net from "net";
import { Collection, Document, Long, MongoClient } from "mongodb";
import {
  IDEApiActions,
  IDEApiCall,
  IDEApiDest,
  UserInfo,
  UserInfoInitPayload,
  RoomJoinPayload,
  TextSelection,
  ExtensionVariableEntry,
  turnVariableEntriesToDebugSnapshot,
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
import { validate } from 'uuid';
import cors from 'cors';
import { Console, time } from "console";



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
let frontendSocketId: string;
const defaultPort = 3000;

const socketPath = "/v2/ide/";

let userInfoMap: Map<string, UserInfo> = new Map();

const mongoUrl = 'mongodb://localhost:27017';
const client = new MongoClient(mongoUrl);
const dbName = "vscode-backend";
const collectionName = "snapshots";
let collection: Collection<Document> | undefined = undefined;

export async function setupServer(port?: number) {
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
    logger.trace(`Socket (${socket.handshake.query.client}) ${socket.id} connected.`);
    if(socket.handshake.query.client === "frontend") {
      //socket.join("frontend");
      logger.debug("Connection with frontend established.");
      frontendSocketId = socket.id;
    }else {
      console.log(`New client connected: ${socket.id}`);
    }
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
      console.log("Socket disconnected " + socket.id + ': ' + reason);
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
        const payload = await doesConnectionExist(frontendHttp);
        if(callback){
          console.log("check-frontend-connection:", payload);
          callback(payload);
        }
    });

    socket.on('load-debug-room-list', (callback) => {
      const frontendSocket = io.sockets.sockets.get(frontendSocketId);
        if(!frontendSocket){
          logger.debug('Unable to find frontend socket');
          if(callback) 
            callback();

          return;
        }

        frontendSocket.emit('load-current-debug-room-list-from-frontend', 
          (roomList?: { alias: string; secret: string; value: string; projectName: string, commitId: string }[]) => 
          {
            if(callback)
              callback(roomList);
          }
        );
    });

    socket.on('retrieve-current-debug-room-list',
      () => {
        const frontendSocket = io.sockets.sockets.get(frontendSocketId);
        if(!frontendSocket){
          logger.debug('Unable to find frontend socket');
          return;
        }
        //let payload = undefined;
        console.log("adds-or-deletes-debug-room");
        frontendSocket.emit('load-current-debug-room-list-from-frontend', 
          (roomList?: { alias: string; secret: string; value: string; }[]) => {
            console.log("roomlist: ", roomList);
            //payload = structuredClone(roomList);
            if (roomList) io.emit("updates-debug-room-list", roomList);
          }
        );
      }
    );

    socket.on('create-landscape', async (alias: string, projectName: string, commitId: string, callback) => {
      const frontendSocket = io.sockets.sockets.get(frontendSocketId);
      if(!frontendSocket){
        logger.debug('Unable to find frontend socket');
        if(callback) callback();
        return;
      }
      let payload = undefined; // notice this is written before emit so it won't be destroyed before callback is called
      frontendSocket.emit('frontend-create-landscape', alias, projectName, commitId, (tokenData: {value: string; secret: string;} | undefined) => {
          payload = structuredClone(tokenData);
          if(callback) {
            callback(payload); // why does callback(tokenData) not work?
          }
      });

      /*try {
        const response = await socket.to("frontend").timeout(3000).emitWithAck("frontend-create-landscape", data);
        console.log("RECEIVED from frontend: ", JSON.stringify(response));
      } catch (error) {
        console.log(error);
      }*/
    });

    socket.on('save-current-state', async (token: string, timestamp: number, valueList: ExtensionVariableEntry[], callback: any) => {
      try {
        if(!collection){
          if (callback)
            callback(false);
          return;
        }
        


        console.log("New Values were saved at timestamp: ", timestamp);
        
        // console.log("The Values are: ");
        // valueList.forEach((variableEntry) => {
        //   console.log("Variable Name: ", variableEntry.varname);
        //   variableEntry.classes.forEach((classEntry) => {
        //     console.log("  Class Name: ", classEntry.className);
        //     classEntry.values.forEach((stateValue) => {
        //       console.log("    Value: ", stateValue.value, " Type: ", stateValue.type, " ObjRef: ", stateValue.objReference);
        //     });
        //   });
        // });

        const debugSnapshot = turnVariableEntriesToDebugSnapshot(valueList, timestamp);
        
        // console.log("Turned to DebugSnapshot: ", debugSnapshot);
        // debugSnapshot.classes.forEach((classEntry) => {
        //   console.log("Class Name: ", classEntry.className);
        //   classEntry.instances.forEach((instance) => {
        //     console.log("  Instance ID: ", instance.instanceId, " Method Name: ", instance.methodName);
        //     instance.variables.forEach((variable) => {
        //       console.log("    Variable Name: ", variable.name, " Type: ", variable.type, " Value: ", variable.value);
        //     });
        //   });
        //   classEntry.methods.forEach((method) => {
        //     console.log("  Method Instance ID: ", method.instanceId, " Method Name: ", method.methodName);
        //     method.variables.forEach((variable) => {
        //       console.log("    Variable Name: ", variable.name, " Type: ", variable.type, " Value: ", variable.value);
        //     });
        //   });
        // });
        


        await collection.insertOne({
          token: token,
          epochNano: Long.fromNumber(timestamp),
          debugSnapshot: debugSnapshot
        });
        if (callback)
          callback(true);

      } catch (error) {
        logger.debug("Error: ", error);
        if(callback)
          callback(false);
        return;
      }

      const frontendSocket = io.sockets.sockets.get(frontendSocketId);
      if(!frontendSocket){
        logger.debug('Unable to find frontend socket');
        if(callback) callback(false);
        return;
      }
      frontendSocket.emit('receive-new-debug-snapshot-timestamp', token, timestamp, (success: boolean) => {
        if(callback) {console.log("Success: ", success); callback(success);}
      });
    });

    socket.on('request-debug-state-snapshot', async (token: string, timestamp: number, callback: any) => {
      if(collection){
        collection.findOne({token: token, epochNano: Long.fromNumber(timestamp)}).then((doc) => {
          if(doc && doc.debugSnapshot){
            callback(true, doc.debugSnapshot.classes);
          } else {
            callback(true, []);
          }
        }).catch((error) => {
          logger.debug("Error retrieving debug snapshot: ", error);
          callback(false, []);
        });
      } else callback(false, []);

    });

    socket.on('request-all-debug-timestamps', async (token: string, callback: any) => {
      if(collection){
      
        collection.find({token: token}, {projection: {epochNano: 1, _id: 0}}).toArray().then((docs) => {
          
          const timestamps: number[] = docs.map(doc => Number(doc.epochNano.toString()));
          callback(true, timestamps);

        }).catch((error) => {
          logger.debug("Error retrieving timestamps: ", error);
          callback(false, []);
          
        });
      } else callback(true, []);
    });

  });

  await client.connect();
  const db = client.db(dbName);
  collection = db.collection(collectionName);
  /*console.log("TEST MONGODB");
  const findResult = await collection.find({}).toArray();
  console.log("Found documents => ", findResult);*/

  backend.use(cors());

  backend.get('/savepoints/:token', function(req, res){
    if(!collection){
      res.send(undefined);
      return;
    }

    const token = req.params.token;
    if(!validate(token)) {
      logger.debug("Invalid token");
      res.send(undefined);
      return;
    }

    // TODO: introduce a new newest to query from frontend (at this moment the newest intended for the span-service is used, therefore savepoints could be skipped or resent)

    try {
      const newest = req.query.newest ? Number(req.query.newest) : undefined;
      const projection = { 
        epochNano: 1
      };
      const query: any = {
        token: token,
      };
      if(newest) {
        console.log("newest = ", newest);
        query.epochNano = { $gt: newest };
      }
      const cursor = collection.find(query, { projection });
      const results =  cursor.toArray();
      results.then(resp => {
        for (const elem of resp) {
          elem['timestamp'] = { epochNano: Number(elem['epochNano'].toString()), spanCount: 0 }; // TODO: spanCount not hard coded
          delete elem['epochNano'];
          // TODO: include debug state variables (which state exactly?)
        }
        res.send(resp);
      });
    } catch (e) {
      logger.debug("Error: ", e);
      res.send(undefined);
    }
  });

  server.listen(port, "0.0.0.0", () => {
    logger.debug(`VS Code backend listening on port ${port}`);
  });
}


// #region Debug Session Helper

async function doesConnectionExist(frontendHttp: string) {
  console.log('doesConnectionExist called with: ', frontendHttp);
  const frontendHttpIpv6Address = await getIpv6Address(frontendHttp);
  const frontendHttpIpv4Address = await getIpv4Address(frontendHttp);
  console.log("Frontend HTTP IPv6 Address: ", frontendHttpIpv6Address);
  console.log("Frontend HTTP IPv4 Address: ", frontendHttpIpv4Address);
  if(!frontendHttpIpv6Address && !frontendHttpIpv4Address) {
    logger.error("Unable to determine frontend ip address");
    console.log("Unable to determine frontend ip address")
    return false;
  }
  const sockets = await io.fetchSockets();
  for (const socket of sockets) {

    const socketAddress = socket.handshake.address;
    const socketClient = socket.handshake.query.client;
    console.log("Socket address: ", socketAddress, " client: ", socketClient);
    if (socketClient !== 'frontend')
      continue;

    if (!net.isIPv4(socketAddress) && !net.isIPv6(socketAddress)){
      logger.error("Socket handshake address is not in IPv4/IPv6 format");
      console.log("Socket handshake address is not in IPv4/IPv6 format");
      continue;
    }

    if(socketClient === 'frontend' || socketAddress === frontendHttpIpv6Address || socketAddress === frontendHttpIpv4Address){
      return true;
    }
  
  }
 
  return false;
}

async function getIpv6Address(input: string): Promise<string | undefined> {

  if (net.isIPv4(input))
    return '::ffff:' + input;

  if (net.isIPv6(input))
    return input;

  const temp = input.split(':');
  const ipAddressWithoutPort = temp[temp.length-1];

  if (net.isIPv4(ipAddressWithoutPort))
    return '::ffff:' + ipAddressWithoutPort;
    
  if (net.isIPv6(ipAddressWithoutPort))
    return ipAddressWithoutPort;

  const url = new URL(input);
  const hostname = url.hostname;
  const lookupAsync = util.promisify(dns.lookup);
  const address = await lookupAsync(hostname);
    
  if(address.family === 6)
    return address.address;

  if(address.family === 4)
    return '::ffff:' + address.address;

}

async function getIpv4Address(input: string): Promise<string | undefined> {

  if (net.isIPv4(input))
    return input;

  if(net.isIPv6(input)){
    // Check if the IPv6 address has the '::ffff:' prefix indicating it's an IPv6-mapped IPv4 address
   const regex = /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/; 
   const match = input.match(regex);

    if (match) {
      const ipv4 = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
      return ipv4;
    }else {
      return;
    }
  }
   

  const temp = input.split(':');
  const ipAddressWithoutPort = temp[temp.length-1];

  if (net.isIPv4(ipAddressWithoutPort))
    return ipAddressWithoutPort;
    
  if(net.isIPv6(ipAddressWithoutPort)){
   // Check if the IPv6 address has the '::ffff:' prefix indicating it's an IPv6-mapped IPv4 address
   const regex = /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/; 
   const match = ipAddressWithoutPort.match(regex);

    if (match) {
      const ipv4 = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
      return ipv4;
    }else {
      return;
    }
  }

  const url = new URL(input);
  const hostname = url.hostname;
  const lookupAsync = util.promisify(dns.lookup);
  const address = await lookupAsync(hostname, {family: 4, all: false});
  return address.address;

}

// #endregion

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
