import { INITIAL_FEN } from './constants.js';

export class MoveNode {
    constructor(fen, moveSan, parent = null, comment = "", nag = 0, toSq = -1, isBook = false) {
        this.fen = fen;
        this.moveSan = moveSan;
        this.parent = parent;
        this.children = [];
        this.selectedChildIndex = 0;
        this.comment = comment;
        this.nag = nag;
        this.toSq = toSq;
        this.arrows = [];
        this.circles = [];
        this.lastMove = null;
        this.isBook = isBook;
    }
}