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
let io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, unknown>;

const defaultPort = 3000;

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
  });

  logger.debug(
    "Max http buffer size for Socket data: " + maxHttpBufferSize / 1e6 + "mb"
  );

  io.on("connection", (socket) => {
    logger.trace(`Socket ${socket.id} connected.`);

    socket.on(
      "join-custom-room",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data: RoomJoinPayload, callback: any) => {
        const roomSubChannel = "ide";
        const roomToJoin = data.roomId + ":" + roomSubChannel;
        socket.join(roomToJoin);

        if (callback) {
          callback(roomToJoin);
        }

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

          socket.join(uniqueRoomName + ":" + roomSubChannel);

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

          socket.join(room + ":" + roomSubChannel);

          logger.debug(
            `Socket ${socket.id} with username ${data.userId} re-joined room ${
              room + ":" + roomSubChannel
            }.`
          );

          userInfoMap.set(data.userId, updatedUserInfo);
          if (callback) {
            callback(room);
          }
        }
      }
    );

    socket.on(IDEApiDest.VizDo, (data: IDEApiCall) => {
      logger.debug({ event: data }, "vizDo");

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
  });

  server.listen(port, "0.0.0.0", () => {
    logger.debug(`VS Code backend listening on port ${port}`);
  });
}

function getRoomWithSubchannelForSocketId(socketId: string) {
  let room = "";

  const roomSet = io.sockets.adapter.sids.get(socketId)?.values();

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
    return;
  }
}

setupServer();

export { backend, io, server, userInfoMap };
