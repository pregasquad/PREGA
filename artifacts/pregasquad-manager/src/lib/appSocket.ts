import { io, Socket } from "socket.io-client";

let _socket: Socket | null = null;

export function getAppSocket(): Socket {
  if (!_socket || _socket.disconnected) {
    _socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
  }
  return _socket;
}
