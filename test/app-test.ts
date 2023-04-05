import Client, { Socket } from "socket.io-client";
import { assert } from "chai";
import { server, io, userInfoMap, setupServer } from "../src/app";
import * as util from "util";
import {
  IDEApiActions,
  IDEApiCall,
  IDEApiDest,
  UserInfo,
  UserInfoInitPayload,
  RoomJoinPayload,
} from "../src/types";

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

    // include unnecessary socketId and room for easier testing of equality

    const username = "fgr983498jngg";

    const newUserInfo = {
      userId: `${username}`,
      room: `change-in-test`,
      socketId: clientSocket.id,
    };

    clientSocket.emit("update-user-info", newUserInfo, (roomId: string) => {
      newUserInfo.room = roomId;

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

      assert.isTrue(io.sockets.adapter.rooms.has(`${roomId}:frontend`));

      assert.isTrue(
        io.sockets.adapter.rooms.get(`${roomId}:frontend`)?.has(clientSocket.id)
      );

      done();
    });
  });

  it("should save multiple user infos from frontend and correctly handle initial room setup", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    // include unnecessary socketId and room for easier testing of equality

    const clientSocketTemp1 = Client(`http://localhost:3000`);
    const clientSocketTemp2 = Client(`http://localhost:3000`);
    const clientSocketTemp3 = Client(`http://localhost:3000`);

    clientSocketTemp1.on("connect", () => {
      clientSocketTemp2.on("connect", () => {
        clientSocketTemp3.on("connect", () => {
          const newUserInfo1 = {
            userId: "1",
            room: "change-in-test",
            socketId: clientSocket.id,
          };

          const newUserInfo2 = {
            userId: "2",
            room: "change-in-test",
            socketId: clientSocketTemp1.id,
          };

          const newUserInfo3 = {
            userId: "3",
            room: "change-in-test",
            socketId: clientSocketTemp2.id,
          };

          const newUserInfo4 = {
            userId: "4",
            room: "change-in-test",
            socketId: clientSocketTemp3.id,
          };

          clientSocket.emit(
            "update-user-info",
            newUserInfo1,
            (room1: string) => {
              clientSocketTemp1.emit(
                "update-user-info",
                newUserInfo2,
                (room2: string) => {
                  clientSocketTemp2.emit(
                    "update-user-info",
                    newUserInfo3,
                    (room3: string) => {
                      clientSocketTemp3.emit(
                        "update-user-info",
                        newUserInfo4,
                        (room4: string) => {
                          newUserInfo1.room = room1;
                          newUserInfo2.room = room2;
                          newUserInfo3.room = room3;
                          newUserInfo4.room = room4;

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

                          assert.isTrue(
                            io.sockets.adapter.rooms.has(`${room1}:frontend`)
                          );

                          assert.isTrue(
                            io.sockets.adapter.rooms.has(`${room2}:frontend`)
                          );

                          assert.isTrue(
                            io.sockets.adapter.rooms.has(`${room3}:frontend`)
                          );

                          assert.isTrue(
                            io.sockets.adapter.rooms.has(`${room4}:frontend`)
                          );

                          assert.isTrue(
                            io.sockets.adapter.rooms
                              .get(`${room1}:frontend`)
                              ?.has(clientSocket.id)
                          );

                          assert.isTrue(
                            io.sockets.adapter.rooms
                              .get(`${room2}:frontend`)
                              ?.has(clientSocketTemp1.id)
                          );

                          assert.isTrue(
                            io.sockets.adapter.rooms
                              .get(`${room3}:frontend`)
                              ?.has(clientSocketTemp2.id)
                          );

                          assert.isTrue(
                            io.sockets.adapter.rooms
                              .get(`${room4}:frontend`)
                              ?.has(clientSocketTemp3.id)
                          );

                          clientSocketTemp1.close();
                          clientSocketTemp2.close();
                          clientSocketTemp3.close();

                          done();
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        });
      });
    });
  }).timeout(5000);

  it("should receive, have no duplicates of user info, and correct user info", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    clientSocket2 = Client(`http://localhost:3000`);
    clientSocket2.on("connect", () => {
      const newUserInfo = {
        userId: "123",
      };

      const updatedUserInfo = {
        userId: "123",
        room: "change-in-test",
        socketId: clientSocket2.id,
      };

      clientSocket.emit("update-user-info", newUserInfo, () => {
        clientSocket2.emit(
          "update-user-info",
          updatedUserInfo,
          (room: string) => {
            updatedUserInfo.room = room;

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

            assert.equal(
              JSON.stringify(userInfoMap.get("123")),
              JSON.stringify(updatedUserInfo)
            );

            assert.isTrue(
              io.sockets.adapter.rooms.has(`${room}:frontend`),
              "Correct room is missing."
            );

            assert.isTrue(
              io.sockets.adapter.rooms
                .get(`${room}:frontend`)
                ?.has(clientSocket2.id),
              "Room is missing the correct socket."
            );

            done();
          }
        );
      });
    });
  });

  it("should use correct room for IDE on custom room joining", (done) => {
    assert.equal(userInfoMap.size, 0, "UserInfoMap should be empty");

    clientSocket2 = Client(`http://localhost:3000`);
    clientSocket2.on("connect", () => {});

    const newUserInfo = {
      userId: "123",
    };

    const idePayload = {
      roomId: "change-in-test",
    };

    clientSocket.emit("update-user-info", newUserInfo, (room: string) => {
      idePayload.roomId = room;
      clientSocket2.emit("join-custom-room", idePayload, () => {
        assert.isTrue(io.sockets.adapter.rooms.has(`${room}:ide`));
        assert.isTrue(
          io.sockets.adapter.rooms.get(`${room}:ide`)?.has(clientSocket2.id)
        );
        done();
      });
    });
  });

  // Interaction

  it("should emit events to frontend subchannel of room when initiated by ide subchannel of same room.", (done) => {
    clientSocket2 = Client(`http://localhost:3000`);

    clientSocket2.on("connect", () => {
      const newUserInfo = {
        userId: "123",
      };

      const idePayload = {
        roomId: "change-in-test",
      };

      const testData = { test: "test" };

      clientSocket.on(IDEApiDest.VizDo, (data) => {
        assert.equal(
          JSON.stringify(data),
          JSON.stringify(testData),
          "Sent data is not correct."
        );
        done();
      });

      clientSocket.emit("update-user-info", newUserInfo, (room: string) => {
        idePayload.roomId = room;

        clientSocket2.emit("join-custom-room", idePayload, () => {
          clientSocket2.emit(IDEApiDest.VizDo, testData);
        });
      });
    });
  });

  it("should emit events to ide subchannel of room when initiated by frontend subchannel of same room.", (done) => {
    clientSocket2 = Client(`http://localhost:3000`);

    clientSocket2.on("connect", () => {
      const newUserInfo = {
        userId: "123",
      };

      const idePayload = {
        roomId: "change-in-test",
      };

      const testData = { test: "test" };

      clientSocket2.on(IDEApiDest.IDEDo, (data) => {
        assert.equal(
          JSON.stringify(data),
          JSON.stringify(testData),
          "Sent data is not correct."
        );
        done();
      });

      clientSocket.emit("update-user-info", newUserInfo, (room: string) => {
        idePayload.roomId = room;

        clientSocket2.emit("join-custom-room", idePayload, () => {
          clientSocket.emit(IDEApiDest.IDEDo, testData);
        });
      });
    });
  });

  it("should emit refresh event to ide subchannel of roome when initiated by frontend subchannel of same room.", (done) => {
    clientSocket2 = Client(`http://localhost:3000`);

    clientSocket2.on("connect", () => {
      const newUserInfo = {
        userId: "123",
      };

      const idePayload = {
        roomId: "change-in-test",
      };

      const testData = { test: "test" };

      const expected = {
        action: "getVizData",
        data: [],
        fqn: "",
        meshId: "",
        occurrenceID: -1,
        foundationCommunicationLinks: testData,
      };

      clientSocket2.on(IDEApiDest.VizDo, (data) => {
        assert.equal(
          JSON.stringify(data),
          JSON.stringify(expected),
          "Sent data is not correct."
        );
        done();
      });

      clientSocket.emit("update-user-info", newUserInfo, (room: string) => {
        idePayload.roomId = room;

        clientSocket2.emit("join-custom-room", idePayload, () => {
          clientSocket.emit(IDEApiActions.Refresh, testData);
        });
      });
    });
  });
});
