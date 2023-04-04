import Client, { Socket } from "socket.io-client";
import { assert } from "chai";
import { server, io, userInfoMap, setupServer } from "../src/app";
import * as util from "util";

describe("Server ...", () => {
  let clientSocket: Socket;
  let clientSocket2: Socket;

  beforeEach((done) => {
    setupServer();
    clientSocket = Client(`http://localhost:3000`);
    clientSocket.on("connect", done);
  });

  afterEach(() => {
    server.close();
    clientSocket.close();

    if (clientSocket2) {
      clientSocket2.close();
    }
  });

  it("should save user info from frontend and correctly handle initial room setup", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    // include unnecessary socketId for easier testing of equality

    const username = "fgr983498jngg";

    const newUserInfo = {
      userId: `${username}`,
      room: `${username}`,
      socketId: clientSocket.id,
    };

    clientSocket.emit("update-user-info", newUserInfo, () => {
      assert.equal(
        userInfoMap.size,
        1,
        "UserInfoMap should contain one element"
      );

      assert.equal(
        JSON.stringify(userInfoMap.get("fgr983498jngg")),
        JSON.stringify(newUserInfo)
      );

      // Two rooms due to default room (each socket automatically joins a room identified by its own id.)
      assert.equal(
        io.sockets.adapter.rooms.size,
        2,
        "Wrong number of rooms in initial room setup."
      );

      assert.isTrue(io.sockets.adapter.rooms.has(`${username}:frontend`));

      assert.isTrue(
        io.sockets.adapter.rooms
          .get(`${username}:frontend`)
          ?.has(clientSocket.id)
      );

      done();
    });
  });

  it("should save multiple user infos from frontend and correctly handle initial room setup", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    // include unnecessary socketId for easier testing of equality

    const clientSocketTemp1 = Client(`http://localhost:3000`);
    const clientSocketTemp2 = Client(`http://localhost:3000`);
    const clientSocketTemp3 = Client(`http://localhost:3000`);

    clientSocketTemp1.on("connect", () => {
      clientSocketTemp2.on("connect", () => {
        clientSocketTemp3.on("connect", () => {
          const newUserInfo1 = {
            userId: "1",
            room: "1",
            socketId: clientSocket.id,
          };

          const newUserInfo2 = {
            userId: "2",
            room: "2",
            socketId: clientSocketTemp1.id,
          };

          const newUserInfo3 = {
            userId: "3",
            room: "3",
            socketId: clientSocketTemp2.id,
          };

          const newUserInfo4 = {
            userId: "4",
            room: "4",
            socketId: clientSocketTemp3.id,
          };

          clientSocket.emit("update-user-info", newUserInfo1, () => {
            clientSocketTemp1.emit("update-user-info", newUserInfo2, () => {
              clientSocketTemp2.emit("update-user-info", newUserInfo3, () => {
                clientSocketTemp3.emit("update-user-info", newUserInfo4, () => {
                  assert.equal(
                    userInfoMap.size,
                    4,
                    "UserInfoMap has wrong number of elements."
                  );

                  /* assert.equal(
                    JSON.stringify(userInfoMap.get("1")),
                    JSON.stringify(newUserInfo1)
                  );*/

                  assert.equal(
                    JSON.stringify(userInfoMap.get("2")),
                    JSON.stringify(newUserInfo2)
                  );

                  /*  assert.equal(
                    JSON.stringify(userInfoMap.get("3")),
                    JSON.stringify(newUserInfo3)
                  );
      
                  assert.equal(
                    JSON.stringify(userInfoMap.get("4")),
                    JSON.stringify(newUserInfo4)
                  );*/

                  clientSocketTemp1.close();
                  clientSocketTemp2.close();
                  clientSocketTemp3.close();

                  done();
                });
              });
            });
          });
        });
      });
    });
  });

  it("should receive, have no duplicates of user info, and correct user info", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    clientSocket2 = Client(`http://localhost:3000`);
    clientSocket2.on("connect", done);

    const newUserInfo = {
      userId: "123",
      room: "123",
    };

    const updatedUserInfo = {
      userId: "123",
      room: "123",
      socketId: clientSocket2.id,
    };

    clientSocket.emit("update-user-info", newUserInfo);
    clientSocket2.emit("update-user-info", updatedUserInfo, () => {
      assert.equal(
        userInfoMap.size,
        1,
        "UserInfoMap should contain one element"
      );

      assert.equal(
        userInfoMap.get("123")?.socketId,
        clientSocket2.id,
        "UserInfoMap entry has wrong socket id."
      );

      done();
    });
  });

  it("should use correct room for IDE on custom room joining", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    clientSocket2 = Client(`http://localhost:3000`);
    clientSocket2.on("connect", () => {
      console.log("init done");
    });

    const newUserInfo = {
      userId: "123",
      room: "123",
    };

    const idePayload = {
      roomId: "123",
    };

    console.debug("before:" + util.inspect(io.sockets.adapter.rooms));

    clientSocket.emit("update-user-info", newUserInfo, () => {
      console.debug("after:" + util.inspect(io.sockets.adapter.rooms));
      clientSocket2.emit("join-custom-room", idePayload, () => {
        assert.isTrue(io.sockets.adapter.rooms.has("123:ide"));
        assert.isTrue(
          io.sockets.adapter.rooms.get("123:ide")?.has(clientSocket2.id)
        );
        done();
      });
    });
  });
});
