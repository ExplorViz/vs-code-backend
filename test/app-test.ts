import Client, { Socket } from "socket.io-client";
import { assert } from "chai";
import { server, userInfoMap } from "../src/app";

describe("server", () => {
  //let io, serverSocket, clientSocket;

  let clientSocket: Socket;

  beforeEach((done) => {
    clientSocket = Client(`http://localhost:3000`);
    clientSocket.on("connect", done);
  });

  afterEach(() => {
    server.close();
    clientSocket.close();
  });

  it("should receive and set user info", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    const newUserInfo = {
      userId: "123",
      room: "123",
      socketId: clientSocket.id,
    };

    clientSocket.emit("update-user-info", newUserInfo, () => {
      assert.equal(
        userInfoMap.size,
        1,
        "UserInfoMap should contain one element"
      );
      done();
    });
  });
});
