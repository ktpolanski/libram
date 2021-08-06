import "core-js/features/object/entries";

import {
  extractItems,
  extractMeat,
  isGiftable,
  toInt,
  visitUrl,
} from "kolmafia";
import { arrayToCountedMap, chunk } from "./utils";

type RawKmail = {
  id: string;
  type: string;
  fromid: string;
  azunixtime: string;
  message: string;
  fromname: string;
  localtime: string;
};

export default class Kmail {
  id: number;
  date: Date;
  type: "normal";
  senderId: number;
  senderName: string;
  message: string;

  /**
   * Parses a kmail from KoL's native format
   * 
   * @param rawKmail Kmail in the format supplies by api.php
   * @returns Parsed kmail
   */
  static parse(rawKmail: RawKmail): Kmail {
    return new Kmail(rawKmail);
  }

  /**
   * Returns all of the player's kmails
   * 
   * @returns Parsed kmails
   */
  static inbox(): Kmail[] {
    return (JSON.parse(
      visitUrl("api.php?what=kmail&for=ASSistant")
    ) as RawKmail[]).map(Kmail.parse);
  }

  /**
   * Bulk delete kmails
   * 
   * @param kmails Kmails to delete
   * @returns Number of kmails deleted
   */
  static delete(kmails: Kmail[]): number {
    const results = visitUrl(`messages.php?the_action=delete&box=Inbox&pwd&${kmails
      .map((k) => `sel${k.id}=on`)
      .join("&")}`);

    return Number(results.match(/<td>(\d) messages? deleted.<\/td>/)?.[1] ?? 0);
  }

  private static _genericSend(
    to: string | number,
    message: string,
    items: Map<Item, number> | Item[],
    meat: number,
    chunkSize: number,
    constructUrl: (meat: number, itemsQuery: string, chunkSize: number) => string,
    successString: string,
  ) {
    let m = meat;

    const sendableItems = [
      ...arrayToCountedMap(items).entries(),
    ].filter(([item]) => isGiftable(item));

    let result = true;

    const chunks = chunk(sendableItems, chunkSize);

    // Split the items to be sent into chunks of max 11 item types
    for (const c of chunks.length > 0 ? chunks : [null]) {
      const itemsQuery = c === null ? [] : c
        .map(
          ([item, quantity], index) =>
            `whichitem${index + 1}=${toInt(item)}&howmany${index + 1}=${quantity}`
        );

      const r = visitUrl(constructUrl(m, itemsQuery.join("&"), itemsQuery.length));

      if (r.includes("That player cannot receive Meat or items")) {
        return Kmail.gift(to, message, items, meat);
      }

      // Make sure we don't send the same batch of meat with every chunk
      m = 0;

      result &&= r.includes(successString);
    }

    return result;
  }

  /**
   * Sends a kmail to a player
   *
   * Sends multiple kmails if more than 11 unique item types are attached.
   * Ignores any ungiftable items.
   * Sends a gift package to players in run
   *
   * @param to The player name or id to receive the kmail
   * @param message The text contents of the message
   * @param items The items to be attached
   * @param meat The quantity of meat to be attached
   * @returns True if the kmail was successfully sent
   */
  static send(
    to: string | number,
    message = "",
    items: Map<Item, number> | Item[] = [],
    meat = 0
  ): boolean {
    return Kmail._genericSend(
      to,
      message,
      items,
      meat,
      11,
      (meat, itemsQuery) => `sendmessage.php?action=send&pwd&towho=${to}&message=${message}${itemsQuery ? `&${itemsQuery}` : ""}&sendmeat=${meat}`,
      ">Message sent.</",
    );
  }

  /**
   * Sends a gift to a player
   * 
   * Sends multiple kmails if more than 3 unique item types are attached.
   * Ignores any ungiftable items.
   * 
   * @param to The player name or id to receive the gift
   * @param note The note on the outside of the gift
   * @param items The items to be attached
   * @param meat The quantity of meat to be attached
   * @param insideNode The note on the inside of the gift
   * @returns True if the gift was successfully sent
   */
  static gift(
    to: string | number,
    message = "",
    items: Map<Item, number> | Item[] = [],
    meat = 0,
    insideNote = "",
  ): boolean {
    const baseUrl = `town_sendgift.php?action=Yep.&pwd&fromwhere=0&note=${message}&insidenote=${insideNote}&towho=${to}`;
    return Kmail._genericSend(
      to,
      message,
      items,
      meat,
      3,
      (m, itemsQuery, chunkSize) => `${baseUrl}&whichpackage=${chunkSize}${itemsQuery ? `&${itemsQuery}` : ""}&sendmeat=${m}`,
      ">Package sent.</",
    );
  }

  private constructor(rawKmail: RawKmail) {
    this.id = Number(rawKmail.id);
    this.date = new Date(rawKmail.localtime);
    this.type = rawKmail.type as Kmail["type"];
    this.senderId = Number(rawKmail.fromid);
    this.senderName = rawKmail.fromname;
    this.message = rawKmail.message;
  }

  /**
   * Delete the kmail
   *
   * @returns Whether the kmail was deleted
   */
  delete(): boolean {
    return Kmail.delete([this]) === 1;
  }

  /**
   * Get items attached to the kmail
   *
   * @returns Map of items attached to the kmail and their quantities
   */
  items(): Map<Item, number> {
    return new Map(
      Object.entries(extractItems(this.message)).map(
        ([itemName, quantity]) => [Item.get(itemName), quantity] as const
      )
    );
  }

  /**
   * Get meat attached to the kmail
   *
   * @returns Meat attached to the kmail
   */
  meat(): number {
    return extractMeat(this.message);
  }

  /**
   * Reply to kmail
   *
   * @see Kmail.send
   *
   * @returns True if the kmail was successfully sent
   */
  reply(
    message = "",
    items: Map<Item, number> | Item[] = [],
    meat = 0
  ): boolean {
    return Kmail.send(this.senderId, message, items, meat);
  }
}