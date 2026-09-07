/**
 * Copyright (c) 2026 Ngvida2108
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://gnu.org>.
 */
export class MoveNode {
    constructor(fen, moveSan, parent = null, comment = null, timeSpent = 0, toSq = -1) {
        this.id = 'n_' + Math.random().toString(36).substr(2, 9);
        this.fen = fen;
        this.moveSan = moveSan;
        this.parent = parent;
        this.children = [];
        this.selectedChildIndex = 0;
        this.comment = comment;
        this.timeSpent = timeSpent;
        this.toSq = toSq;
        this.lastMove = null;
        this.isPV = false;
        this.nag = null;
        this.evalScore = undefined;
        this.eval = undefined;
        this.localEvalScore = undefined;
        this.localEval = undefined;
        this.depth = undefined;
        this.pv = undefined;
        this.score = null;
        this.isBook = false;
        this.nps = null;
        this.latency = null;
        this.arrows = null;
        this.circles = null;
        this.clock = null;
        this.cccTimeLeft = null;
        this.isIllegal = false;
        this.reviewed = false;
        this.isCollapsed = false;
        this.graphX = 0;
        this.graphY = 0;
        if (fen) {
            const parts = fen.split(' ');
            this.turnColor = parts[1] || 'w';
            this.moveNumber = parseInt(parts[5], 10) || 1;
            this.hasVariantModifier = fen.includes('~');
        } else {
            this.turnColor = 'w';
            this.moveNumber = 1;
            this.hasVariantModifier = false;
        }
    }
}