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