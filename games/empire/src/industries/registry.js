/* 产业处理器注册表：typeId -> handler */
import cstore from "./cstore.js";
import bank from "./bank.js";
import express from "./express.js";
import rental from "./rental.js";
import realestate from "./realestate.js";
import dealer from "./dealer.js";
import itcorp from "./itcorp.js";
import oil from "./oil.js";
import club from "./club.js";

export const IND_HANDLERS = { cstore, bank, express, rental, realestate, dealer, itcorp, oil, club };
