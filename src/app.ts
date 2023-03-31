import express from "express";
import { Server } from "socket.io";
import http from "http";
import {
  IDEApiActions,
  IDEApiCall,
  IDEApiDest,
  UserInfo,
  UserInfoInitPayload,
} from "./types";

const backend = express();
const server = http.createServer(backend);
const maxHttpBufferSize = 1e8;

const port = 3000;
const corsExplorVizHttp = "http://localhost:4200";

const io = new Server(server, {
  maxHttpBufferSize: maxHttpBufferSize,
  cors: {
    origin: corsExplorVizHttp,
    methods: ["GET", "POST"],
  },
});

const userInfoMap: Map<string, UserInfo> = new Map();

console.log(
  "Max http buffer size for Socket data: " + maxHttpBufferSize / 1e6 + "mb"
);

io.on("connection", (socket) => {
  //console.log('Backend Sockets established.');

  console.log(`Socket ${socket.id} connected.`);

  socket.on("update-user-info", (data: UserInfoInitPayload, callback: any) => {
    const foundUserId = userInfoMap.get(data.userId);
    if (!foundUserId) {
      const roomSubChannel = data.isFrontend ? "frontend" : "ide";

      socket.join(data.userId + ":" + roomSubChannel);

      const newUserInfo: UserInfo = {
        userId: data.userId,
        room: data.userId,
        socketId: data.socketId,
      };
      userInfoMap.set(data.userId, newUserInfo);
      if (callback) {
        callback();
      }
    }
  });

  socket.on(IDEApiDest.VizDo, (data: IDEApiCall) => {
    console.log("vizDo", data);
    socket.broadcast.emit(IDEApiDest.VizDo, data);
  });
  socket.on(IDEApiDest.IDEDo, (data: IDEApiCall) => {
    console.log("ideDo", data);
    socket.broadcast.emit(IDEApiDest.IDEDo, data);
  });

  socket.on(IDEApiActions.Refresh, (cls) => {
    console.log(`refresh sent by ${socket.id}`);
    const data: IDEApiCall = {
      action: IDEApiActions.GetVizData,
      data: [],
      fqn: "",
      meshId: "",
      occurrenceID: -1,
      foundationCommunicationLinks: cls,
    };
    socket.emit(IDEApiDest.VizDo, data);
    // console.log("ideDo", cls.length)
  });

  socket.on("vizDoubleClickOnMesh", (data) => {
    console.log("vizDoubleClickOnMesh: ", data);
  });

  socket.on("disconnect", (reason) => {
    console.error(`Socket ${socket.id} disconnected, reason: ${reason}`);
    // console.error(`Possible solution: Increase current maxHttpBufferSize of ` + (maxHttpBufferSize / 1e6) + "mb");
  });
});

// backend.get('/', (req, res) => {
//   console.log('/');
//   res.send('Hello World!!');
// });

// backend.get('/testOne', (req, res) => {
//   console.log('/ testOne');
//   res.send('testOne');
// });

server.listen(port, () => {
  console.log(`VS Code backend listening on port ${port}`);
});

export { backend, port, io, server, userInfoMap };
