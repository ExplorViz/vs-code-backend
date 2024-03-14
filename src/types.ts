export enum IDEApiDest {
  VizDo = "vizDo",
  IDEDo = "ideDo",
}

export enum IDEApiActions {
  Refresh = "refresh",
  SingleClickOnMesh = "singleClickOnMesh",
  DoubleClickOnMesh = "doubleClickOnMesh",
  ClickTimeline = "clickTimeLine",
  GetVizData = "getVizData",
  JumpToLocation = "jumpToLocation",
  JumpToMonitoringClass = "jumpToMonitoringClass",
  DisconnectFrontend = 'disconnectFrontend',
  DisconnectIDE = 'disconnectIDE',
}

export type TextSelection = {
  documentUri: string;
  startLine: number;
  startCharPos: number;
  endLine: number;
  endCharPos: number;
} | null;

export type RoomJoinPayload = {
  roomId: string;
};

export type UserInfoMap = {
  userId: string;
  userInfoObj: UserInfo;
};

export type UserInfo = {
  userId: string;
  socketId: string;
  room: string;
};

export type UserInfoInitPayload = {
  userId: string;
  isFrontend: boolean;
};

type CommunicationLink = {
  sourceMeshID: string;
  targetMeshID: string;
  meshID: string;
};

export type IDEApiCall = {
  action: IDEApiActions;
  data: OrderTuple[];
  meshId: string;
  occurrenceID: number;
  fqn: string;
  foundationCommunicationLinks: CommunicationLink[];
};

export type ParentOrder = {
  fqn: string;
  childs: ParentOrder[];
  meshId: string;
};

export type OrderTuple = {
  hierarchyModel: ParentOrder;
  meshes: { meshNames: string[]; meshIds: string[] };
};

export type classMethod = {
  name: string;
  fqn: string;
  lineString: string;
  lineNumber: number;
  // meshId: string,
  // fileLocation: string,
};

export type FoundationOccurrences = {
  foundation: string;
  occurrences: number[];
};

export type LocationFind = {
  javaFiles: string[];
  dirs: string[];
  javaFile: string[];
};
