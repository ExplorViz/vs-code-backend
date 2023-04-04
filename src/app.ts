import express from "express";
import { Server } from "socket.io";
import http from "http";
import {
  IDEApiActions,
  IDEApiCall,
  IDEApiDest,
  UserInfo,
  UserInfoInitPayload,
  RoomJoinPayload,
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

const backend = express();
let server: http.Server;
const maxHttpBufferSize = 1e8;
let io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>;

const defaultPort = 3000;
const corsExplorVizHttp = "http://localhost:4200";

let userInfoMap: Map<string, UserInfo> = new Map();

export function setupServer(port?: number) {
  userInfoMap = new Map();

  server = http.createServer(backend);

  if (!port) {
    port = defaultPort;
  }

  io = new Server(server, {
    maxHttpBufferSize: maxHttpBufferSize,
    cors: {
      origin: corsExplorVizHttp,
      methods: ["GET", "POST"],
    },
  });

  logger.debug(
    "Max http buffer size for Socket data: " + maxHttpBufferSize / 1e6 + "mb"
  );

  io.on("connection", (socket) => {
    logger.debug(`Socket ${socket.id} connected.`);

    socket.on(
      "join-custom-room",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data: RoomJoinPayload, callback: any) => {
        const roomSubChannel = "ide";
        socket.join(data.roomId + ":" + roomSubChannel);

        if (callback) {
          callback();
        }
      }
    );

    socket.on(
      "update-user-info",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data: UserInfoInitPayload, callback: any) => {
        const foundUserId = userInfoMap.get(data.userId);
        if (!foundUserId) {
          const roomSubChannel = "frontend";

          logger.trace(
            {
              event: util.inspect(socket.rooms),
            },
            "rooms obj before join"
          );

          const uniqueRoomName = uniqueNamesGenerator(
            customNamesGeneratorConfig
          );

          socket.join(uniqueRoomName + ":" + roomSubChannel);

          logger.debug(
            `Socket ${socket.id} joined room ${
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
          if (callback) {
            callback(uniqueRoomName);
          }
        } else {
          const { room } = foundUserId;

          const updatedUserInfo: UserInfo = {
            userId: data.userId,
            room: room,
            socketId: socket.id,
          };
          userInfoMap.set(data.userId, updatedUserInfo);
          if (callback) {
            callback(room);
          }
        }
      }
    );

    socket.on(IDEApiDest.VizDo, (data: IDEApiCall) => {
      logger.debug("vizDo", data);
      socket.broadcast.emit(IDEApiDest.VizDo, data);
    });
    socket.on(IDEApiDest.IDEDo, (data: IDEApiCall) => {
      logger.debug("ideDo", data);
      socket.broadcast.emit(IDEApiDest.IDEDo, data);
    });

    socket.on(IDEApiActions.Refresh, (cls) => {
      logger.debug(`refresh sent by ${socket.id}`);
      const data: IDEApiCall = {
        action: IDEApiActions.GetVizData,
        data: [],
        fqn: "",
        meshId: "",
        occurrenceID: -1,
        foundationCommunicationLinks: cls,
      };
      socket.emit(IDEApiDest.VizDo, data);
      // logger.debug("ideDo", cls.length)
    });

    socket.on("vizDoubleClickOnMesh", (data) => {
      logger.debug("vizDoubleClickOnMesh: ", data);
    });

    socket.on("disconnect", (reason) => {
      logger.debug(`Socket ${socket.id} disconnected, reason: ${reason}`);
      // console.error(`Possible solution: Increase current maxHttpBufferSize of ` + (maxHttpBufferSize / 1e6) + "mb");
    });
  });

  // backend.get('/', (req, res) => {
  //   logger.debug('/');
  //   res.send('Hello World!!');
  // });

  // backend.get('/testOne', (req, res) => {
  //   logger.debug('/ testOne');
  //   res.send('testOne');
  // });

  server.listen(port, () => {
    logger.debug(`VS Code backend listening on port ${port}`);
  });
}

//setupServer();

export { backend, io, server, userInfoMap };
