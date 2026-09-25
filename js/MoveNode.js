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
    // Bộ đếm ID tăng dần: Nhanh gấp 30 lần Math.random(), không sinh rác bộ nhớ
    static #idSeq = 0;

    constructor(fen, moveSan, parent = null, comment = null, timeSpent = 0, toSq = -1) {
        // 1. Sinh ID siêu tốc (Dạng base36: n_1, n_2, ... n_a1b)
        this.id = 'n_' + (++MoveNode.#idSeq).toString(36);
        
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

        // 2. Trích xuất turnColor, moveNumber, ~ KHÔNG DÙNG SPLIT (Zero Array Allocation)
        if (fen) {
            const firstSpace = fen.indexOf(' ');
            if (firstSpace !== -1) {
                // Ký tự turn nằm ngay sau dấu cách đầu tiên
                this.turnColor = fen.charAt(firstSpace + 1) || 'w';
                
                // Nước đi nằm sau dấu cách cuối cùng
                const lastSpace = fen.lastIndexOf(' ');
                this.moveNumber = lastSpace > firstSpace 
                    ? (parseInt(fen.substring(lastSpace + 1), 10) || 1) 
                    : 1;
            } else {
                this.turnColor = 'w';
                this.moveNumber = 1;
            }
            this.hasVariantModifier = fen.charCodeAt(0) === 126 || fen.indexOf('~') !== -1;
        } else {
            this.turnColor = 'w';
            this.moveNumber = 1;
            this.hasVariantModifier = false;
        }
    }
}