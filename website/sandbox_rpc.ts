/*!
   Copyright 2018 Propel http://propel.site/.  All rights reserved.
   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
 */

import { createResolvable, Resolvable } from "../src/util";

export type RpcHandler = (...args: any[]) => any;
export type RpcHandlers = { [name: string]: RpcHandler };

interface HandshakeMessage {
  type: "syn" | "ack";
}

interface CallMessage {
  type: "call";
  id: number;
  handler: string;
  args: any[];
}

interface ReturnMessage {
  type: "return";
  id: number;
  result?: any;
  exception?: any;
}

type Message = HandshakeMessage | CallMessage | ReturnMessage;

export class SandboxRPC {
  private active = false;
  private counter = 0;
  private handlers: RpcHandlers;
  private ready = createResolvable();
  private returnHandlers = new Map<number, Resolvable<any>>();

  constructor(private readonly remote: Window, private readonly channelId) {}

  // Use an arrow function to make this function have a bound `this`.
  private receive = (ev: MessageEvent) => {
    if (ev.data instanceof Object &&
        ev.data.rpcChannelId === this.channelId) {
      this.onMessage(ev.data);
    }
  }

  private send(message: Message) {
    this.remote.postMessage(
        { rpcChannelId: this.channelId, ...message }, "*");
  }

  start(handlers: RpcHandlers): void {
    if (this.active) {
      throw new Error("RPC channel already active");
    }

    this.active = true;
    this.handlers = handlers;
    window.addEventListener("message", this.receive);
    this.send({ type: "syn" });
  }

  stop(): void {
    if (!this.active) {
      throw new Error("RPC channel not active");
    }

    this.active = false;
    window.removeEventListener("message", this.receive);

    for (const [_, res] of this.returnHandlers) {
      res.reject(new Error("RPC channel stopped"));
    }
  }

  async call(handler: string, ...args: any[]): Promise<any> {
    if (!this.active) {
      throw new Error("RPC channel not active");
    }

    await this.ready;

    const id = this.counter++;
    const message: CallMessage = {
      type: "call",
      id,
      handler,
      args
    };

    const resolver = createResolvable<any>();
    this.returnHandlers.set(id, resolver);

    try {
      this.send(message);
      return await resolver;
    } finally {
      this.returnHandlers.delete(id);
    }
  }

  private onMessage(message: Message): void {
    switch (message.type) {
      case "syn":
      case "ack":
        this.onHandshake(message as HandshakeMessage);
        break;
      case "call":
        this.onCall(message as CallMessage);
        break;
      case "return":
        this.onReturn(message as ReturnMessage);
        break;
    }
  }

  private onHandshake(message: HandshakeMessage) {
    const { type } = message;
    if (type === "syn") {
      this.send({ type: "ack" });
    }
    this.ready.resolve();
  }

  private async onCall(message: CallMessage) {
    const { id, handler, args } = message;
    const ret: ReturnMessage = {
      type: "return",
      id
    };
    try {
      const result = await this.handlers[handler](...args);
      this.send({ result, ...ret });
    } catch (exception) {
      if (exception instanceof Error) {
        // Convert to a normal object.
        const { message, stack } = exception;
        exception = { message, stack, __error__: true };
      }
      this.send({ exception, ...ret });
    }
  }

  private onReturn(message: ReturnMessage) {
    const { id } = message;
    const resolver = this.returnHandlers.get(id);
    if (message.hasOwnProperty("exception")) {
      let { exception } = message;
      if (exception.__error__) {
        // Convert to Error object.
        exception = Object.assign(new Error(exception.message),
                                  { stack: exception.stack });
      }
      resolver.reject(exception);
    } else {
      resolver.resolve(message.result);
    }
  }
}
