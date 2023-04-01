import Client, { Socket } from "socket.io-client";
import { assert } from "chai";
import { server, userInfoMap, setupServer } from "../src/app";

describe("Server ...", () => {
  let clientSocket: Socket;

  beforeEach((done) => {
    setupServer();
    clientSocket = Client(`http://localhost:3000`);
    clientSocket.on("connect", done);
  });

  afterEach(() => {
    server.close();
    clientSocket.close();
  });

  it("should receive and set single user info", (done) => {
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

  it("should receive and set multiple user infos", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    const newUserInfo1 = {
      userId: "1",
      room: "1",
      socketId: clientSocket.id,
    };

    const newUserInfo2 = {
      userId: "2",
      room: "2",
      socketId: clientSocket.id,
    };

    const newUserInfo3 = {
      userId: "3",
      room: "3",
      socketId: clientSocket.id,
    };

    const newUserInfo4 = {
      userId: "4",
      room: "4",
      socketId: clientSocket.id,
    };

    clientSocket.emit("update-user-info", newUserInfo1);
    clientSocket.emit("update-user-info", newUserInfo2);
    clientSocket.emit("update-user-info", newUserInfo3);
    clientSocket.emit("update-user-info", newUserInfo4, () => {
      assert.equal(
        userInfoMap.size,
        4,
        "UserInfoMap has wrong number of elements."
      );

      assert.equal(
        JSON.stringify(userInfoMap.get("1")),
        JSON.stringify(newUserInfo1)
      );

      assert.equal(
        JSON.stringify(userInfoMap.get("2")),
        JSON.stringify(newUserInfo2)
      );

      assert.equal(
        JSON.stringify(userInfoMap.get("3")),
        JSON.stringify(newUserInfo3)
      );

      assert.equal(
        JSON.stringify(userInfoMap.get("4")),
        JSON.stringify(newUserInfo4)
      );

      done();
    });
  });

  it("should receive, have no duplicates of user info, and correct user info", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    const newUserInfo = {
      userId: "123",
      room: "123",
      socketId: clientSocket.id,
    };

    const updatedUserInfo = {
      userId: "123",
      room: "123",
      socketId: "456",
    };

    clientSocket.emit("update-user-info", newUserInfo);
    clientSocket.emit("update-user-info", updatedUserInfo, () => {
      assert.equal(
        userInfoMap.size,
        1,
        "UserInfoMap should contain one element"
      );

      assert.equal(
        userInfoMap.get("123")?.socketId,
        "456",
        "UserInfoMap entry has wrong socket id."
      );

      done();
    });
  });

  it("should save user info with room id equal to user id", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    const newUserInfo = {
      userId: "fgr983498jngg",
      room: "fgr983498jngg",
      socketId: clientSocket.id,
    };

    clientSocket.emit("update-user-info", newUserInfo, () => {
      assert.equal(
        JSON.stringify(userInfoMap.get("fgr983498jngg")),
        JSON.stringify(newUserInfo)
      );
      done();
    });
  });
});
