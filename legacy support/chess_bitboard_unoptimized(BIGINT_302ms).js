var Chess = function(fen) {
    function log(ctx, msg) { console.log(`%c[${ctx}]`, "color: #0ff; font-weight: bold;", msg); }
    function error(ctx, msg) { console.error(`%c[${ctx}]`, "color: #f00; font-weight: bold;", msg); }
    const MAX_GAME_MOVES = 2048;
    const HIST_M = new Int32Array(MAX_GAME_MOVES);
    const HIST_C = new BigUint64Array(MAX_GAME_MOVES);
    const HIST_E = new Int16Array(MAX_GAME_MOVES);
    const HIST_H = new Int16Array(MAX_GAME_MOVES);
    const HIST_N = new Int32Array(MAX_GAME_MOVES);
    const HIST_CAP = new Int8Array(MAX_GAME_MOVES);
    var HIST_META = new Array(MAX_GAME_MOVES); 
    
    // Pointer to current history depth
    var hist_ply = 0;
	const BETWEEN = [
  [0n,0n,2n,6n,14n,30n,62n,126n,0n,0n,0n,0n,0n,0n,0n,0n,256n,0n,512n,0n,0n,0n,0n,0n,65792n,0n,0n,262656n,0n,0n,0n,0n,16843008n,0n,0n,0n,134480384n,0n,0n,0n,4311810304n,0n,0n,0n,0n,68853957120n,0n,0n,1103823438080n,0n,0n,0n,0n,0n,35253226045952n,0n,282578800148736n,0n,0n,0n,0n,0n,0n,18049651735527936n],
  [0n,0n,0n,4n,12n,28n,60n,124n,0n,0n,0n,0n,0n,0n,0n,0n,0n,512n,0n,1024n,0n,0n,0n,0n,0n,131584n,0n,0n,525312n,0n,0n,0n,0n,33686016n,0n,0n,0n,268960768n,0n,0n,0n,8623620608n,0n,0n,0n,0n,137707914240n,0n,0n,2207646876160n,0n,0n,0n,0n,0n,70506452091904n,0n,565157600297472n,0n,0n,0n,0n,0n,0n],
  [2n,0n,0n,0n,8n,24n,56n,120n,0n,0n,0n,0n,0n,0n,0n,0n,512n,0n,1024n,0n,2048n,0n,0n,0n,0n,0n,263168n,0n,0n,1050624n,0n,0n,0n,0n,67372032n,0n,0n,0n,537921536n,0n,0n,0n,17247241216n,0n,0n,0n,0n,275415828480n,0n,0n,4415293752320n,0n,0n,0n,0n,0n,0n,0n,1130315200594944n,0n,0n,0n,0n,0n],
  [6n,4n,0n,0n,0n,16n,48n,112n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1024n,0n,2048n,0n,4096n,0n,0n,132096n,0n,0n,526336n,0n,0n,2101248n,0n,0n,0n,0n,134744064n,0n,0n,0n,1075843072n,0n,0n,0n,34494482432n,0n,0n,0n,0n,0n,0n,0n,8830587504640n,0n,0n,0n,0n,0n,0n,0n,2260630401189888n,0n,0n,0n,0n],
  [14n,12n,8n,0n,0n,0n,32n,96n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,2048n,0n,4096n,0n,8192n,0n,0n,264192n,0n,0n,1052672n,0n,0n,4202496n,33818624n,0n,0n,0n,269488128n,0n,0n,0n,0n,0n,0n,0n,68988964864n,0n,0n,0n,0n,0n,0n,0n,17661175009280n,0n,0n,0n,0n,0n,0n,0n,4521260802379776n,0n,0n,0n],
  [30n,28n,24n,16n,0n,0n,0n,64n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,4096n,0n,8192n,0n,16384n,0n,0n,528384n,0n,0n,2105344n,0n,0n,0n,67637248n,0n,0n,0n,538976256n,0n,0n,8657571840n,0n,0n,0n,0n,137977929728n,0n,0n,0n,0n,0n,0n,0n,35322350018560n,0n,0n,0n,0n,0n,0n,0n,9042521604759552n,0n,0n],
  [62n,60n,56n,48n,32n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,8192n,0n,16384n,0n,0n,0n,0n,1056768n,0n,0n,4210688n,0n,0n,0n,135274496n,0n,0n,0n,1077952512n,0n,0n,17315143680n,0n,0n,0n,0n,275955859456n,0n,2216338399232n,0n,0n,0n,0n,0n,70644700037120n,0n,0n,0n,0n,0n,0n,0n,18085043209519104n,0n],
  [126n,124n,120n,112n,96n,64n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,16384n,0n,32768n,0n,0n,0n,0n,2113536n,0n,0n,8421376n,0n,0n,0n,270548992n,0n,0n,0n,2155905024n,0n,0n,34630287360n,0n,0n,0n,0n,551911718912n,0n,4432676798464n,0n,0n,0n,0n,0n,141289400074240n,567382630219776n,0n,0n,0n,0n,0n,0n,36170086419038208n],
  [0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,512n,1536n,3584n,7680n,15872n,32256n,0n,0n,0n,0n,0n,0n,0n,0n,65536n,0n,131072n,0n,0n,0n,0n,0n,16842752n,0n,0n,67239936n,0n,0n,0n,0n,4311810048n,0n,0n,0n,34426978304n,0n,0n,0n,1103823437824n,0n,0n,0n,0n,17626613022720n,0n,0n,282578800148480n,0n,0n,0n,0n,0n,9024825867763712n,0n],
  [0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1024n,3072n,7168n,15360n,31744n,0n,0n,0n,0n,0n,0n,0n,0n,0n,131072n,0n,262144n,0n,0n,0n,0n,0n,33685504n,0n,0n,134479872n,0n,0n,0n,0n,8623620096n,0n,0n,0n,68853956608n,0n,0n,0n,2207646875648n,0n,0n,0n,0n,35253226045440n,0n,0n,565157600296960n,0n,0n,0n,0n,0n,18049651735527424n],
  [0n,0n,0n,0n,0n,0n,0n,0n,512n,0n,0n,0n,2048n,6144n,14336n,30720n,0n,0n,0n,0n,0n,0n,0n,0n,131072n,0n,262144n,0n,524288n,0n,0n,0n,0n,0n,67371008n,0n,0n,268959744n,0n,0n,0n,0n,17247240192n,0n,0n,0n,137707913216n,0n,0n,0n,4415293751296n,0n,0n,0n,0n,70506452090880n,0n,0n,1130315200593920n,0n,0n,0n,0n,0n],
  [0n,0n,0n,0n,0n,0n,0n,0n,1536n,1024n,0n,0n,0n,4096n,12288n,28672n,0n,0n,0n,0n,0n,0n,0n,0n,0n,262144n,0n,524288n,0n,1048576n,0n,0n,33816576n,0n,0n,134742016n,0n,0n,537919488n,0n,0n,0n,0n,34494480384n,0n,0n,0n,275415826432n,0n,0n,0n,8830587502592n,0n,0n,0n,0n,0n,0n,0n,2260630401187840n,0n,0n,0n,0n],
  [0n,0n,0n,0n,0n,0n,0n,0n,3584n,3072n,2048n,0n,0n,0n,8192n,24576n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,524288n,0n,1048576n,0n,2097152n,0n,0n,67633152n,0n,0n,269484032n,0n,0n,1075838976n,8657567744n,0n,0n,0n,68988960768n,0n,0n,0n,0n,0n,0n,0n,17661175005184n,0n,0n,0n,0n,0n,0n,0n,4521260802375680n,0n,0n,0n],
  [0n,0n,0n,0n,0n,0n,0n,0n,7680n,7168n,6144n,4096n,0n,0n,0n,16384n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1048576n,0n,2097152n,0n,4194304n,0n,0n,135266304n,0n,0n,538968064n,0n,0n,0n,17315135488n,0n,0n,0n,137977921536n,0n,0n,2216338391040n,0n,0n,0n,0n,35322350010368n,0n,0n,0n,0n,0n,0n,0n,9042521604751360n,0n,0n],
  [0n,0n,0n,0n,0n,0n,0n,0n,15872n,15360n,14336n,12288n,8192n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,2097152n,0n,4194304n,0n,0n,0n,0n,270532608n,0n,0n,1077936128n,0n,0n,0n,34630270976n,0n,0n,0n,275955843072n,0n,0n,4432676782080n,0n,0n,0n,0n,70644700020736n,0n,567382630203392n,0n,0n,0n,0n,0n,18085043209502720n,0n],
  [0n,0n,0n,0n,0n,0n,0n,0n,32256n,31744n,30720n,28672n,24576n,16384n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,4194304n,0n,8388608n,0n,0n,0n,0n,541065216n,0n,0n,2155872256n,0n,0n,0n,69260541952n,0n,0n,0n,551911686144n,0n,0n,8865353564160n,0n,0n,0n,0n,141289400041472n,0n,1134765260406784n,0n,0n,0n,0n,0n,36170086419005440n],
  [256n,0n,512n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,131072n,393216n,917504n,1966080n,4063232n,8257536n,0n,0n,0n,0n,0n,0n,0n,0n,16777216n,0n,33554432n,0n,0n,0n,0n,0n,4311744512n,0n,0n,17213423616n,0n,0n,0n,0n,1103823372288n,0n,0n,0n,8813306445824n,0n,0n,0n,282578800082944n,0n,0n,0n,0n,4512412933816320n,0n,0n],
  [0n,512n,0n,1024n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,262144n,786432n,1835008n,3932160n,8126464n,0n,0n,0n,0n,0n,0n,0n,0n,0n,33554432n,0n,67108864n,0n,0n,0n,0n,0n,8623489024n,0n,0n,34426847232n,0n,0n,0n,0n,2207646744576n,0n,0n,0n,17626612891648n,0n,0n,0n,565157600165888n,0n,0n,0n,0n,9024825867632640n,0n],
  [512n,0n,1024n,0n,2048n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,131072n,0n,0n,0n,524288n,1572864n,3670016n,7864320n,0n,0n,0n,0n,0n,0n,0n,0n,33554432n,0n,67108864n,0n,134217728n,0n,0n,0n,0n,0n,17246978048n,0n,0n,68853694464n,0n,0n,0n,0n,4415293489152n,0n,0n,0n,35253225783296n,0n,0n,0n,1130315200331776n,0n,0n,0n,0n,18049651735265280n],
  [0n,1024n,0n,2048n,0n,4096n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,393216n,262144n,0n,0n,0n,1048576n,3145728n,7340032n,0n,0n,0n,0n,0n,0n,0n,0n,0n,67108864n,0n,134217728n,0n,268435456n,0n,0n,8657043456n,0n,0n,34493956096n,0n,0n,137707388928n,0n,0n,0n,0n,8830586978304n,0n,0n,0n,70506451566592n,0n,0n,0n,2260630400663552n,0n,0n,0n,0n],
  [0n,0n,2048n,0n,4096n,0n,8192n,0n,0n,0n,0n,0n,0n,0n,0n,0n,917504n,786432n,524288n,0n,0n,0n,2097152n,6291456n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,134217728n,0n,268435456n,0n,536870912n,0n,0n,17314086912n,0n,0n,68987912192n,0n,0n,275414777856n,2216337342464n,0n,0n,0n,17661173956608n,0n,0n,0n,0n,0n,0n,0n,4521260801327104n,0n,0n,0n],
  [0n,0n,0n,4096n,0n,8192n,0n,16384n,0n,0n,0n,0n,0n,0n,0n,0n,1966080n,1835008n,1572864n,1048576n,0n,0n,0n,4194304n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,268435456n,0n,536870912n,0n,1073741824n,0n,0n,34628173824n,0n,0n,137975824384n,0n,0n,0n,4432674684928n,0n,0n,0n,35322347913216n,0n,0n,567382628106240n,0n,0n,0n,0n,9042521602654208n,0n,0n],
  [0n,0n,0n,0n,8192n,0n,16384n,0n,0n,0n,0n,0n,0n,0n,0n,0n,4063232n,3932160n,3670016n,3145728n,2097152n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,536870912n,0n,1073741824n,0n,0n,0n,0n,69256347648n,0n,0n,275951648768n,0n,0n,0n,8865349369856n,0n,0n,0n,70644695826432n,0n,0n,1134765256212480n,0n,0n,0n,0n,18085043205308416n,0n],
  [0n,0n,0n,0n,0n,16384n,0n,32768n,0n,0n,0n,0n,0n,0n,0n,0n,8257536n,8126464n,7864320n,7340032n,6291456n,4194304n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1073741824n,0n,2147483648n,0n,0n,0n,0n,138512695296n,0n,0n,551903297536n,0n,0n,0n,17730698739712n,0n,0n,0n,141289391652864n,0n,0n,2269530512424960n,0n,0n,0n,0n,36170086410616832n],
  [65792n,0n,0n,132096n,0n,0n,0n,0n,65536n,0n,131072n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,33554432n,100663296n,234881024n,503316480n,1040187392n,2113929216n,0n,0n,0n,0n,0n,0n,0n,0n,4294967296n,0n,8589934592n,0n,0n,0n,0n,0n,1103806595072n,0n,0n,4406636445696n,0n,0n,0n,0n,282578783305728n,0n,0n,0n,2256206450130944n,0n,0n,0n],
  [0n,131584n,0n,0n,264192n,0n,0n,0n,0n,131072n,0n,262144n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,67108864n,201326592n,469762048n,1006632960n,2080374784n,0n,0n,0n,0n,0n,0n,0n,0n,0n,8589934592n,0n,17179869184n,0n,0n,0n,0n,0n,2207613190144n,0n,0n,8813272891392n,0n,0n,0n,0n,565157566611456n,0n,0n,0n,4512412900261888n,0n,0n],
  [0n,0n,263168n,0n,0n,528384n,0n,0n,131072n,0n,262144n,0n,524288n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,33554432n,0n,0n,0n,134217728n,402653184n,939524096n,2013265920n,0n,0n,0n,0n,0n,0n,0n,0n,8589934592n,0n,17179869184n,0n,34359738368n,0n,0n,0n,0n,0n,4415226380288n,0n,0n,17626545782784n,0n,0n,0n,0n,1130315133222912n,0n,0n,0n,9024825800523776n,0n],
  [262656n,0n,0n,526336n,0n,0n,1056768n,0n,0n,262144n,0n,524288n,0n,1048576n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,100663296n,67108864n,0n,0n,0n,268435456n,805306368n,1879048192n,0n,0n,0n,0n,0n,0n,0n,0n,0n,17179869184n,0n,34359738368n,0n,68719476736n,0n,0n,2216203124736n,0n,0n,8830452760576n,0n,0n,35253091565568n,0n,0n,0n,0n,2260630266445824n,0n,0n,0n,18049651601047552n],
  [0n,525312n,0n,0n,1052672n,0n,0n,2113536n,0n,0n,524288n,0n,1048576n,0n,2097152n,0n,0n,0n,0n,0n,0n,0n,0n,0n,234881024n,201326592n,134217728n,0n,0n,0n,536870912n,1610612736n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,34359738368n,0n,68719476736n,0n,137438953472n,0n,0n,4432406249472n,0n,0n,17660905521152n,0n,0n,70506183131136n,567382359670784n,0n,0n,0n,4521260532891648n,0n,0n,0n],
  [0n,0n,1050624n,0n,0n,2105344n,0n,0n,0n,0n,0n,1048576n,0n,2097152n,0n,4194304n,0n,0n,0n,0n,0n,0n,0n,0n,503316480n,469762048n,402653184n,268435456n,0n,0n,0n,1073741824n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,68719476736n,0n,137438953472n,0n,274877906944n,0n,0n,8864812498944n,0n,0n,35321811042304n,0n,0n,0n,1134764719341568n,0n,0n,0n,9042521065783296n,0n,0n],
  [0n,0n,0n,2101248n,0n,0n,4210688n,0n,0n,0n,0n,0n,2097152n,0n,4194304n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1040187392n,1006632960n,939524096n,805306368n,536870912n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,137438953472n,0n,274877906944n,0n,0n,0n,0n,17729624997888n,0n,0n,70643622084608n,0n,0n,0n,2269529438683136n,0n,0n,0n,18085042131566592n,0n],
  [0n,0n,0n,0n,4202496n,0n,0n,8421376n,0n,0n,0n,0n,0n,4194304n,0n,8388608n,0n,0n,0n,0n,0n,0n,0n,0n,2113929216n,2080374784n,2013265920n,1879048192n,1610612736n,1073741824n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,274877906944n,0n,549755813888n,0n,0n,0n,0n,35459249995776n,0n,0n,141287244169216n,0n,0n,0n,4539058877366272n,0n,0n,0n,36170084263133184n],
  [16843008n,0n,0n,0n,33818624n,0n,0n,0n,16842752n,0n,0n,33816576n,0n,0n,0n,0n,16777216n,0n,33554432n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,8589934592n,25769803776n,60129542144n,128849018880n,266287972352n,541165879296n,0n,0n,0n,0n,0n,0n,0n,0n,1099511627776n,0n,2199023255552n,0n,0n,0n,0n,0n,282574488338432n,0n,0n,1128098930098176n,0n,0n,0n,0n],
  [0n,33686016n,0n,0n,0n,67637248n,0n,0n,0n,33685504n,0n,0n,67633152n,0n,0n,0n,0n,33554432n,0n,67108864n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,17179869184n,51539607552n,120259084288n,257698037760n,532575944704n,0n,0n,0n,0n,0n,0n,0n,0n,0n,2199023255552n,0n,4398046511104n,0n,0n,0n,0n,0n,565148976676864n,0n,0n,2256197860196352n,0n,0n,0n],
  [0n,0n,67372032n,0n,0n,0n,135274496n,0n,0n,0n,67371008n,0n,0n,135266304n,0n,0n,33554432n,0n,67108864n,0n,134217728n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,8589934592n,0n,0n,0n,34359738368n,103079215104n,240518168576n,515396075520n,0n,0n,0n,0n,0n,0n,0n,0n,2199023255552n,0n,4398046511104n,0n,8796093022208n,0n,0n,0n,0n,0n,1130297953353728n,0n,0n,4512395720392704n,0n,0n],
  [0n,0n,0n,134744064n,0n,0n,0n,270548992n,67239936n,0n,0n,134742016n,0n,0n,270532608n,0n,0n,67108864n,0n,134217728n,0n,268435456n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,25769803776n,17179869184n,0n,0n,0n,68719476736n,206158430208n,481036337152n,0n,0n,0n,0n,0n,0n,0n,0n,0n,4398046511104n,0n,8796093022208n,0n,17592186044416n,0n,0n,567347999932416n,0n,0n,2260595906707456n,0n,0n,9024791440785408n,0n],
  [134480384n,0n,0n,0n,269488128n,0n,0n,0n,0n,134479872n,0n,0n,269484032n,0n,0n,541065216n,0n,0n,134217728n,0n,268435456n,0n,536870912n,0n,0n,0n,0n,0n,0n,0n,0n,0n,60129542144n,51539607552n,34359738368n,0n,0n,0n,137438953472n,412316860416n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,8796093022208n,0n,17592186044416n,0n,35184372088832n,0n,0n,1134695999864832n,0n,0n,4521191813414912n,0n,0n,18049582881570816n],
  [0n,268960768n,0n,0n,0n,538976256n,0n,0n,0n,0n,268959744n,0n,0n,538968064n,0n,0n,0n,0n,0n,268435456n,0n,536870912n,0n,1073741824n,0n,0n,0n,0n,0n,0n,0n,0n,128849018880n,120259084288n,103079215104n,68719476736n,0n,0n,0n,274877906944n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,17592186044416n,0n,35184372088832n,0n,70368744177664n,0n,0n,2269391999729664n,0n,0n,9042383626829824n,0n,0n],
  [0n,0n,537921536n,0n,0n,0n,1077952512n,0n,0n,0n,0n,537919488n,0n,0n,1077936128n,0n,0n,0n,0n,0n,536870912n,0n,1073741824n,0n,0n,0n,0n,0n,0n,0n,0n,0n,266287972352n,257698037760n,240518168576n,206158430208n,137438953472n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,35184372088832n,0n,70368744177664n,0n,0n,0n,0n,4538783999459328n,0n,0n,18084767253659648n,0n],
  [0n,0n,0n,1075843072n,0n,0n,0n,2155905024n,0n,0n,0n,0n,1075838976n,0n,0n,2155872256n,0n,0n,0n,0n,0n,1073741824n,0n,2147483648n,0n,0n,0n,0n,0n,0n,0n,0n,541165879296n,532575944704n,515396075520n,481036337152n,412316860416n,274877906944n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,70368744177664n,0n,140737488355328n,0n,0n,0n,0n,9077567998918656n,0n,0n,36169534507319296n],
  [4311810304n,0n,0n,0n,0n,8657571840n,0n,0n,4311810048n,0n,0n,0n,8657567744n,0n,0n,0n,4311744512n,0n,0n,8657043456n,0n,0n,0n,0n,4294967296n,0n,8589934592n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,2199023255552n,6597069766656n,15393162788864n,32985348833280n,68169720922112n,138538465099776n,0n,0n,0n,0n,0n,0n,0n,0n,281474976710656n,0n,562949953421312n,0n,0n,0n,0n,0n],
  [0n,8623620608n,0n,0n,0n,0n,17315143680n,0n,0n,8623620096n,0n,0n,0n,17315135488n,0n,0n,0n,8623489024n,0n,0n,17314086912n,0n,0n,0n,0n,8589934592n,0n,17179869184n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,4398046511104n,13194139533312n,30786325577728n,65970697666560n,136339441844224n,0n,0n,0n,0n,0n,0n,0n,0n,0n,562949953421312n,0n,1125899906842624n,0n,0n,0n,0n],
  [0n,0n,17247241216n,0n,0n,0n,0n,34630287360n,0n,0n,17247240192n,0n,0n,0n,34630270976n,0n,0n,0n,17246978048n,0n,0n,34628173824n,0n,0n,8589934592n,0n,17179869184n,0n,34359738368n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,2199023255552n,0n,0n,0n,8796093022208n,26388279066624n,61572651155456n,131941395333120n,0n,0n,0n,0n,0n,0n,0n,0n,562949953421312n,0n,1125899906842624n,0n,2251799813685248n,0n,0n,0n],
  [0n,0n,0n,34494482432n,0n,0n,0n,0n,0n,0n,0n,34494480384n,0n,0n,0n,69260541952n,17213423616n,0n,0n,34493956096n,0n,0n,69256347648n,0n,0n,17179869184n,0n,34359738368n,0n,68719476736n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,6597069766656n,4398046511104n,0n,0n,0n,17592186044416n,52776558133248n,123145302310912n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1125899906842624n,0n,2251799813685248n,0n,4503599627370496n,0n,0n],
  [0n,0n,0n,0n,68988964864n,0n,0n,0n,34426978304n,0n,0n,0n,68988960768n,0n,0n,0n,0n,34426847232n,0n,0n,68987912192n,0n,0n,138512695296n,0n,0n,34359738368n,0n,68719476736n,0n,137438953472n,0n,0n,0n,0n,0n,0n,0n,0n,0n,15393162788864n,13194139533312n,8796093022208n,0n,0n,0n,35184372088832n,105553116266496n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,2251799813685248n,0n,4503599627370496n,0n,9007199254740992n,0n],
  [68853957120n,0n,0n,0n,0n,137977929728n,0n,0n,0n,68853956608n,0n,0n,0n,137977921536n,0n,0n,0n,0n,68853694464n,0n,0n,137975824384n,0n,0n,0n,0n,0n,68719476736n,0n,137438953472n,0n,274877906944n,0n,0n,0n,0n,0n,0n,0n,0n,32985348833280n,30786325577728n,26388279066624n,17592186044416n,0n,0n,0n,70368744177664n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,4503599627370496n,0n,9007199254740992n,0n,18014398509481984n],
  [0n,137707914240n,0n,0n,0n,0n,275955859456n,0n,0n,0n,137707913216n,0n,0n,0n,275955843072n,0n,0n,0n,0n,137707388928n,0n,0n,275951648768n,0n,0n,0n,0n,0n,137438953472n,0n,274877906944n,0n,0n,0n,0n,0n,0n,0n,0n,0n,68169720922112n,65970697666560n,61572651155456n,52776558133248n,35184372088832n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,9007199254740992n,0n,18014398509481984n,0n],
  [0n,0n,275415828480n,0n,0n,0n,0n,551911718912n,0n,0n,0n,275415826432n,0n,0n,0n,551911686144n,0n,0n,0n,0n,275414777856n,0n,0n,551903297536n,0n,0n,0n,0n,0n,274877906944n,0n,549755813888n,0n,0n,0n,0n,0n,0n,0n,0n,138538465099776n,136339441844224n,131941395333120n,123145302310912n,105553116266496n,70368744177664n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,18014398509481984n,0n,36028797018963968n],
  [1103823438080n,0n,0n,0n,0n,0n,2216338399232n,0n,1103823437824n,0n,0n,0n,0n,2216338391040n,0n,0n,1103823372288n,0n,0n,0n,2216337342464n,0n,0n,0n,1103806595072n,0n,0n,2216203124736n,0n,0n,0n,0n,1099511627776n,0n,2199023255552n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,562949953421312n,1688849860263936n,3940649673949184n,8444249301319680n,17451448556060672n,35465847065542656n,0n,0n,0n,0n,0n,0n,0n,0n],
  [0n,2207646876160n,0n,0n,0n,0n,0n,4432676798464n,0n,2207646875648n,0n,0n,0n,0n,4432676782080n,0n,0n,2207646744576n,0n,0n,0n,4432674684928n,0n,0n,0n,2207613190144n,0n,0n,4432406249472n,0n,0n,0n,0n,2199023255552n,0n,4398046511104n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1125899906842624n,3377699720527872n,7881299347898368n,16888498602639360n,34902897112121344n,0n,0n,0n,0n,0n,0n,0n,0n],
  [0n,0n,4415293752320n,0n,0n,0n,0n,0n,0n,0n,4415293751296n,0n,0n,0n,0n,8865353564160n,0n,0n,4415293489152n,0n,0n,0n,8865349369856n,0n,0n,0n,4415226380288n,0n,0n,8864812498944n,0n,0n,2199023255552n,0n,4398046511104n,0n,8796093022208n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,562949953421312n,0n,0n,0n,2251799813685248n,6755399441055744n,15762598695796736n,33776997205278720n,0n,0n,0n,0n,0n,0n,0n,0n],
  [0n,0n,0n,8830587504640n,0n,0n,0n,0n,0n,0n,0n,8830587502592n,0n,0n,0n,0n,0n,0n,0n,8830586978304n,0n,0n,0n,17730698739712n,4406636445696n,0n,0n,8830452760576n,0n,0n,17729624997888n,0n,0n,4398046511104n,0n,8796093022208n,0n,17592186044416n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1688849860263936n,1125899906842624n,0n,0n,0n,4503599627370496n,13510798882111488n,31525197391593472n,0n,0n,0n,0n,0n,0n,0n,0n],
  [0n,0n,0n,0n,17661175009280n,0n,0n,0n,0n,0n,0n,0n,17661175005184n,0n,0n,0n,8813306445824n,0n,0n,0n,17661173956608n,0n,0n,0n,0n,8813272891392n,0n,0n,17660905521152n,0n,0n,35459249995776n,0n,0n,8796093022208n,0n,17592186044416n,0n,35184372088832n,0n,0n,0n,0n,0n,0n,0n,0n,0n,3940649673949184n,3377699720527872n,2251799813685248n,0n,0n,0n,9007199254740992n,27021597764222976n,0n,0n,0n,0n,0n,0n,0n,0n],
  [0n,0n,0n,0n,0n,35322350018560n,0n,0n,17626613022720n,0n,0n,0n,0n,35322350010368n,0n,0n,0n,17626612891648n,0n,0n,0n,35322347913216n,0n,0n,0n,0n,17626545782784n,0n,0n,35321811042304n,0n,0n,0n,0n,0n,17592186044416n,0n,35184372088832n,0n,70368744177664n,0n,0n,0n,0n,0n,0n,0n,0n,8444249301319680n,7881299347898368n,6755399441055744n,4503599627370496n,0n,0n,0n,18014398509481984n,0n,0n,0n,0n,0n,0n,0n,0n],
  [35253226045952n,0n,0n,0n,0n,0n,70644700037120n,0n,0n,35253226045440n,0n,0n,0n,0n,70644700020736n,0n,0n,0n,35253225783296n,0n,0n,0n,70644695826432n,0n,0n,0n,0n,35253091565568n,0n,0n,70643622084608n,0n,0n,0n,0n,0n,35184372088832n,0n,70368744177664n,0n,0n,0n,0n,0n,0n,0n,0n,0n,17451448556060672n,16888498602639360n,15762598695796736n,13510798882111488n,9007199254740992n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n],
  [0n,70506452091904n,0n,0n,0n,0n,0n,141289400074240n,0n,0n,70506452090880n,0n,0n,0n,0n,141289400041472n,0n,0n,0n,70506451566592n,0n,0n,0n,141289391652864n,0n,0n,0n,0n,70506183131136n,0n,0n,141287244169216n,0n,0n,0n,0n,0n,70368744177664n,0n,140737488355328n,0n,0n,0n,0n,0n,0n,0n,0n,35465847065542656n,34902897112121344n,33776997205278720n,31525197391593472n,27021597764222976n,18014398509481984n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n],
  [282578800148736n,0n,0n,0n,0n,0n,0n,567382630219776n,282578800148480n,0n,0n,0n,0n,0n,567382630203392n,0n,282578800082944n,0n,0n,0n,0n,567382628106240n,0n,0n,282578783305728n,0n,0n,0n,567382359670784n,0n,0n,0n,282574488338432n,0n,0n,567347999932416n,0n,0n,0n,0n,281474976710656n,0n,562949953421312n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,144115188075855872n,432345564227567616n,1008806316530991104n,2161727821137838080n,4467570830351532032n,9079256848778919936n],
  [0n,565157600297472n,0n,0n,0n,0n,0n,0n,0n,565157600296960n,0n,0n,0n,0n,0n,1134765260406784n,0n,565157600165888n,0n,0n,0n,0n,1134765256212480n,0n,0n,565157566611456n,0n,0n,0n,1134764719341568n,0n,0n,0n,565148976676864n,0n,0n,1134695999864832n,0n,0n,0n,0n,562949953421312n,0n,1125899906842624n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,288230376151711744n,864691128455135232n,2017612633061982208n,4323455642275676160n,8935141660703064064n],
  [0n,0n,1130315200594944n,0n,0n,0n,0n,0n,0n,0n,1130315200593920n,0n,0n,0n,0n,0n,0n,0n,1130315200331776n,0n,0n,0n,0n,2269530512424960n,0n,0n,1130315133222912n,0n,0n,0n,2269529438683136n,0n,0n,0n,1130297953353728n,0n,0n,2269391999729664n,0n,0n,562949953421312n,0n,1125899906842624n,0n,2251799813685248n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,144115188075855872n,0n,0n,0n,576460752303423488n,1729382256910270464n,4035225266123964416n,8646911284551352320n],
  [0n,0n,0n,2260630401189888n,0n,0n,0n,0n,0n,0n,0n,2260630401187840n,0n,0n,0n,0n,0n,0n,0n,2260630400663552n,0n,0n,0n,0n,0n,0n,0n,2260630266445824n,0n,0n,0n,4539058877366272n,1128098930098176n,0n,0n,2260595906707456n,0n,0n,4538783999459328n,0n,0n,1125899906842624n,0n,2251799813685248n,0n,4503599627370496n,0n,0n,0n,0n,0n,0n,0n,0n,0n,0n,432345564227567616n,288230376151711744n,0n,0n,0n,1152921504606846976n,3458764513820540928n,8070450532247928832n],
  [0n,0n,0n,0n,4521260802379776n,0n,0n,0n,0n,0n,0n,0n,4521260802375680n,0n,0n,0n,0n,0n,0n,0n,4521260801327104n,0n,0n,0n,2256206450130944n,0n,0n,0n,4521260532891648n,0n,0n,0n,0n,2256197860196352n,0n,0n,4521191813414912n,0n,0n,9077567998918656n,0n,0n,2251799813685248n,0n,4503599627370496n,0n,9007199254740992n,0n,0n,0n,0n,0n,0n,0n,0n,0n,1008806316530991104n,864691128455135232n,576460752303423488n,0n,0n,0n,2305843009213693952n,6917529027641081856n],
  [0n,0n,0n,0n,0n,9042521604759552n,0n,0n,0n,0n,0n,0n,0n,9042521604751360n,0n,0n,4512412933816320n,0n,0n,0n,0n,9042521602654208n,0n,0n,0n,4512412900261888n,0n,0n,0n,9042521065783296n,0n,0n,0n,0n,4512395720392704n,0n,0n,9042383626829824n,0n,0n,0n,0n,0n,4503599627370496n,0n,9007199254740992n,0n,18014398509481984n,0n,0n,0n,0n,0n,0n,0n,0n,2161727821137838080n,2017612633061982208n,1729382256910270464n,1152921504606846976n,0n,0n,0n,4611686018427387904n],
  [0n,0n,0n,0n,0n,0n,18085043209519104n,0n,9024825867763712n,0n,0n,0n,0n,0n,18085043209502720n,0n,0n,9024825867632640n,0n,0n,0n,0n,18085043205308416n,0n,0n,0n,9024825800523776n,0n,0n,0n,18085042131566592n,0n,0n,0n,0n,9024791440785408n,0n,0n,18084767253659648n,0n,0n,0n,0n,0n,9007199254740992n,0n,18014398509481984n,0n,0n,0n,0n,0n,0n,0n,0n,0n,4467570830351532032n,4323455642275676160n,4035225266123964416n,3458764513820540928n,2305843009213693952n,0n,0n,0n],
  [18049651735527936n,0n,0n,0n,0n,0n,0n,36170086419038208n,0n,18049651735527424n,0n,0n,0n,0n,0n,36170086419005440n,0n,0n,18049651735265280n,0n,0n,0n,0n,36170086410616832n,0n,0n,0n,18049651601047552n,0n,0n,0n,36170084263133184n,0n,0n,0n,0n,18049582881570816n,0n,0n,36169534507319296n,0n,0n,0n,0n,0n,18014398509481984n,0n,36028797018963968n,0n,0n,0n,0n,0n,0n,0n,0n,9079256848778919936n,8935141660703064064n,8646911284551352320n,8070450532247928832n,6917529027641081856n,4611686018427387904n,0n,0n]
];
	const ALIGNED = [
  [true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true],
  [true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false],
  [true,true,true,true,true,true,true,true,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false],
  [true,true,true,true,true,true,true,true,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false],
  [true,true,true,true,true,true,true,true,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,true,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false],
  [true,true,true,true,true,true,true,true,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false],
  [true,true,true,true,true,true,true,true,false,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false],
  [true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true,true,false,false,false,false,false,false,true],
  [true,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false],
  [true,true,true,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true],
  [false,true,true,true,false,false,false,false,true,true,true,true,true,true,true,true,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false],
  [false,false,true,true,true,false,false,false,true,true,true,true,true,true,true,true,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false],
  [false,false,false,true,true,true,false,false,true,true,true,true,true,true,true,true,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,true,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false],
  [false,false,false,false,true,true,true,false,true,true,true,true,true,true,true,true,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false],
  [false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true,false],
  [false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true],
  [true,false,true,false,false,false,false,false,true,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false],
  [false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false],
  [true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,true,true,true,true,true,true,true,true,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true],
  [false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,true,true,true,true,true,true,true,true,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false],
  [false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,true,true,true,true,true,true,true,true,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,true,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false],
  [false,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,true,true,true,true,true,true,true,true,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,false],
  [false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false],
  [false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true],
  [true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false],
  [false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false],
  [false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,true,true,true,true,true,true,true,true,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false],
  [true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,true,true,true,true,true,true,true,true,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true],
  [false,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,true,true,true,true,true,true,true,true,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,true,false,false,false,true,false,false,false],
  [false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,true,true,true,true,true,true,true,true,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false],
  [false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false],
  [false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true],
  [true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false],
  [false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false],
  [false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,true,true,true,true,true,true,true,true,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false],
  [false,false,false,true,false,false,false,true,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,true,true,true,true,true,true,true,true,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true,false],
  [true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,true,true,true,true,true,true,true,true,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false,true],
  [false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,true,true,true,true,true,true,true,true,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,true,false,false,true,false,false],
  [false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false],
  [false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true],
  [true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false,false],
  [false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,false,true,false,false,false,false],
  [false,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,true,true,true,true,true,true,true,true,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false,false],
  [false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,true,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,true,true,true,true,true,true,true,true,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false,false],
  [false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,true,true,true,true,true,true,true,true,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true,false],
  [true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,true,true,true,true,true,true,true,true,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false,true],
  [false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,true,true,true,false,false,false,false,true,false,true,false],
  [false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,true,false,false,false,false,false,true,false,true],
  [true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false],
  [false,true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false],
  [false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,true,true,true,true,true,true,true,true,false,true,true,true,false,false,false,false],
  [false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,true,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,true,true,true,true,true,true,true,true,false,false,true,true,true,false,false,false],
  [false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,true,true,true,true,true,true,true,true,false,false,false,true,true,true,false,false],
  [false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,true,true,true,true,true,true,true,true,false,false,false,false,true,true,true,false],
  [true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,true,true,true],
  [false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,false,false,false,false,false,false,true,true],
  [true,false,false,false,false,false,false,true,true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,false,true,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true],
  [false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,false,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,false,true,true,true,true,true,true,true,true],
  [false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,true,false,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,false,true,true,true,true,true,true,true,true],
  [false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,true,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,false,true,true,true,true,true,true,true,true],
  [false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,true,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,false,true,true,true,true,true,true,true,true],
  [false,false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,true,false,false,false,false,true,true,true,false,true,true,true,true,true,true,true,true],
  [false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true],
  [true,false,false,false,false,false,false,true,false,true,false,false,false,false,false,true,false,false,true,false,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false,false,true,false,false,true,false,false,false,false,false,true,false,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true]
];
    const WHITE = 0, BLACK = 1, PAWN = 0, KNIGHT = 1, BISHOP = 2, ROOK = 3, QUEEN = 4, KING = 5;
    const PIECE_TO_CHAR = ['p', 'n', 'b', 'r', 'q', 'k'];
    const CHAR_TO_PIECE = { p:0, n:1, b:2, r:3, q:4, k:5 };
    const BITS = { NORMAL: 1, CAPTURE: 2, BIG_PAWN: 4, EP_CAPTURE: 8, PROMOTION: 16, KSIDE_CASTLE: 32, QSIDE_CASTLE: 64 };
    const ZERO = 0n;
	const U64_MAX = 0xFFFFFFFFFFFFFFFFn;
    const SQ_STR = [
        "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
        "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
        "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
        "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
        "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
        "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
        "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
        "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8"
    ];
    var bitboards = new Array(12).fill(0n);
	var board_arr = new Int8Array(64).fill(-1);
    var turn = WHITE, castling = 0n, ep_square = -1, half_moves = 0, move_number = 1, history = [];
    const DEBRUIJN64 = 0x07EDD5E59A4E28C2n;
    const INDEX64 = [
        63,  0, 58,  1, 59, 47, 53,  2,
        60, 39, 48, 27, 54, 33, 42,  3,
        61, 51, 37, 40, 49, 18, 28, 20,
        55, 30, 34, 11, 43, 14, 22,  4,
        62, 57, 46, 52, 38, 26, 32, 41,
        50, 36, 17, 19, 29, 10, 13, 21,
        56, 45, 25, 31, 35, 16,  9, 12,
        44, 24, 15,  8, 23,  7,  6,  5
    ];
	const MASKS = [
        0x1n, 0x2n, 0x4n, 0x8n, 0x10n, 0x20n, 0x40n, 0x80n, 
        0x100n, 0x200n, 0x400n, 0x800n, 0x1000n, 0x2000n, 0x4000n, 0x8000n, 
        0x10000n, 0x20000n, 0x40000n, 0x80000n, 0x100000n, 0x200000n, 0x400000n, 0x800000n, 
        0x1000000n, 0x2000000n, 0x4000000n, 0x8000000n, 0x10000000n, 0x20000000n, 0x40000000n, 0x80000000n, 
        0x100000000n, 0x200000000n, 0x400000000n, 0x800000000n, 0x1000000000n, 0x2000000000n, 0x4000000000n, 0x8000000000n, 
        0x10000000000n, 0x20000000000n, 0x40000000000n, 0x80000000000n, 0x100000000000n, 0x200000000000n, 0x400000000000n, 0x800000000000n, 
        0x1000000000000n, 0x2000000000000n, 0x4000000000000n, 0x8000000000000n, 0x10000000000000n, 0x20000000000000n, 0x40000000000000n, 0x80000000000000n, 
        0x100000000000000n, 0x200000000000000n, 0x400000000000000n, 0x800000000000000n, 0x1000000000000000n, 0x2000000000000000n, 0x4000000000000000n, 0x8000000000000000n
    ];
    const FILE_MASKS = [
        0x101010101010101n, 0x202020202020202n, 0x404040404040404n, 0x808080808080808n, 
        0x1010101010101010n, 0x2020202020202020n, 0x4040404040404040n, 0x8080808080808080n
    ];
    const KNIGHT_ATTACKS = [
        0x20400n, 0x50800n, 0xa1100n, 0x142200n, 0x284400n, 0x508800n, 0xa01000n, 0x402000n, 
        0x2040004n, 0x5080008n, 0xa110011n, 0x14220022n, 0x28440044n, 0x50880088n, 0xa0100010n, 0x40200020n, 
        0x204000402n, 0x508000805n, 0xa1100110an, 0x1422002214n, 0x2844004428n, 0x5088008850n, 0xa0100010a0n, 0x4020002040n, 
        0x20400040200n, 0x50800080500n, 0xa1100110a00n, 0x142200221400n, 0x284400442800n, 0x508800885000n, 0xa0100010a000n, 0x402000204000n, 
        0x2040004020000n, 0x5080008050000n, 0xa1100110a0000n, 0x14220022140000n, 0x28440044280000n, 0x50880088500000n, 0xa0100010a00000n, 0x40200020400000n, 
        0x204000402000000n, 0x508000805000000n, 0xa1100110a000000n, 0x1422002214000000n, 0x2844004428000000n, 0x5088008850000000n, 0xa0100010a0000000n, 0x4020002040000000n, 
        0x400040200000000n, 0x800080500000000n, 0x1100110a00000000n, 0x2200221400000000n, 0x4400442800000000n, 0x8800885000000000n, 0x100010a000000000n, 0x2000204000000000n, 
        0x4020000000000n, 0x8050000000000n, 0x110a0000000000n, 0x22140000000000n, 0x44280000000000n, 0x88500000000000n, 0x10a00000000000n, 0x20400000000000n
    ];
    const KING_ATTACKS = [
        0x302n, 0x705n, 0xe0an, 0x1c14n, 0x3828n, 0x7050n, 0xe0a0n, 0xc040n,
        0x30203n, 0x70507n, 0xe0a0en, 0x1c141cn, 0x382838n, 0x705070n, 0xe0a0e0n, 0xc040c0n,
        0x3020300n, 0x7050700n, 0xe0a0e00n, 0x1c141c00n, 0x38283800n, 0x70507000n, 0xe0a0e000n, 0xc040c000n,
        0x302030000n, 0x705070000n, 0xe0a0e0000n, 0x1c141c0000n, 0x3828380000n, 0x7050700000n, 0xe0a0e00000n, 0xc040c00000n,
        0x30203000000n, 0x70507000000n, 0xe0a0e000000n, 0x1c141c000000n, 0x382838000000n, 0x705070000000n, 0xe0a0e0000000n, 0xc040c0000000n,
        0x3020300000000n, 0x7050700000000n, 0xe0a0e00000000n, 0x1c141c00000000n, 0x38283800000000n, 0x70507000000000n, 0xe0a0e000000000n, 0xc040c000000000n,
        0x302030000000000n, 0x705070000000000n, 0xe0a0e0000000000n,  0x1c141c0000000000n, 0x3828380000000000n, 0x7050700000000000n, 0xe0a0e00000000000n, 0xc040c00000000000n,
        0x203000000000000n, 0x507000000000000n, 0xa0e000000000000n, 0x141c000000000000n, 0x2838000000000000n, 0x5070000000000000n, 0xa0e0000000000000n, 0x40c0000000000000n
    ];
    const PAWN_ATTACKS = [
        [ // WHITE
            0x200n, 0x500n, 0xa00n, 0x1400n, 0x2800n, 0x5000n, 0xa000n, 0x4000n, 
            0x20000n, 0x50000n, 0xa0000n, 0x140000n, 0x280000n, 0x500000n, 0xa00000n, 0x400000n, 
            0x2000000n, 0x5000000n, 0xa000000n, 0x14000000n, 0x28000000n, 0x50000000n, 0xa0000000n, 0x40000000n, 
            0x200000000n, 0x500000000n, 0xa00000000n, 0x1400000000n, 0x2800000000n, 0x5000000000n, 0xa000000000n, 0x4000000000n, 
            0x20000000000n, 0x50000000000n, 0xa0000000000n, 0x140000000000n, 0x280000000000n, 0x500000000000n, 0xa00000000000n, 0x400000000000n, 
            0x2000000000000n, 0x5000000000000n, 0xa000000000000n, 0x14000000000000n, 0x28000000000000n, 0x50000000000000n, 0xa0000000000000n, 0x40000000000000n, 
            0x200000000000000n, 0x500000000000000n, 0xa00000000000000n, 0x1400000000000000n, 0x2800000000000000n, 0x5000000000000000n, 0xa000000000000000n, 0x4000000000000000n, 
            0x0n, 0x0n, 0x0n, 0x0n, 0x0n, 0x0n, 0x0n, 0x0n
        ],
        [ // BLACK
            0x0n, 0x0n, 0x0n, 0x0n, 0x0n, 0x0n, 0x0n, 0x0n, 
            0x2n, 0x5n, 0xan, 0x14n, 0x28n, 0x50n, 0xa0n, 0x40n, 
            0x200n, 0x500n, 0xa00n, 0x1400n, 0x2800n, 0x5000n, 0xa000n, 0x4000n, 
            0x20000n, 0x50000n, 0xa0000n, 0x140000n, 0x280000n, 0x500000n, 0xa00000n, 0x400000n, 
            0x2000000n, 0x5000000n, 0xa000000n, 0x14000000n, 0x28000000n, 0x50000000n, 0xa0000000n, 0x40000000n, 
            0x200000000n, 0x500000000n, 0xa00000000n, 0x1400000000n, 0x2800000000n, 0x5000000000n, 0xa000000000n, 0x4000000000n, 
            0x20000000000n, 0x50000000000n, 0xa0000000000n, 0x140000000000n, 0x280000000000n, 0x500000000000n, 0xa00000000000n, 0x400000000000n, 
            0x2000000000000n, 0x5000000000000n, 0xa000000000000n, 0x14000000000000n, 0x28000000000000n, 0x50000000000000n, 0xa0000000000000n, 0x40000000000000n
        ]
    ];
    function ctz(b) {if (b === 0n) return 64;return INDEX64[Number(((b & -b) * DEBRUIJN64 & U64_MAX) >> 58n)];}
    function str_to_sq(s) { return (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97); }
    function sq_str(sq) { return SQ_STR[sq]; }
    function check_bit(bb, sq) { return (bb & MASKS[sq]) !== 0n; }
    function get_type_at(sq, col) {
        if (sq < 0 || sq > 63) return -1;
        const val = board_arr[sq];
        if (val === -1) return -1;
        if ((val >> 3) === col) return val & 7;
        
        return -1;
    }
    function get_char_at(sq) {
        if (sq < 0 || sq > 63) return '';
        const val = board_arr[sq];
        if (val === -1) return '';
        return PIECE_TO_CHAR[val & 7];
    }
    function get_occupied() {
        return bitboards[0]|bitboards[1]|bitboards[2]|bitboards[3]|bitboards[4]|bitboards[5]|
               bitboards[6]|bitboards[7]|bitboards[8]|bitboards[9]|bitboards[10]|bitboards[11];
    }
    function get_color_occ(c) {
        return bitboards[c*6]|bitboards[c*6+1]|bitboards[c*6+2]|bitboards[c*6+3]|bitboards[c*6+4]|bitboards[c*6+5];
    }
    function get_slider_attacks(type, sq, occ) {
        let att = 0n, r = sq >> 3, f = sq & 7;
        if (type === ROOK || type === QUEEN) {
            for (let i = r + 1; i < 8; i++) { let m = MASKS[i * 8 + f]; att |= m; if (occ & m) break; }
            for (let i = r - 1; i >= 0; i--) { let m = MASKS[i * 8 + f]; att |= m; if (occ & m) break; }
            for (let i = f + 1; i < 8; i++) { let m = MASKS[r * 8 + i]; att |= m; if (occ & m) break; }
            for (let i = f - 1; i >= 0; i--) { let m = MASKS[r * 8 + i]; att |= m; if (occ & m) break; }
        }
        if (type === BISHOP || type === QUEEN) {
            for (let i = r + 1, j = f + 1; i < 8 && j < 8; i++, j++) { let m = MASKS[i * 8 + j]; att |= m; if (occ & m) break; }
            for (let i = r + 1, j = f - 1; i < 8 && j >= 0; i++, j--) { let m = MASKS[i * 8 + j]; att |= m; if (occ & m) break; }
            for (let i = r - 1, j = f + 1; i >= 0 && j < 8; i--, j++) { let m = MASKS[i * 8 + j]; att |= m; if (occ & m) break; }
            for (let i = r - 1, j = f - 1; i >= 0 && j >= 0; i--, j--) { let m = MASKS[i * 8 + j]; att |= m; if (occ & m) break; }
        }
        return att;
    }
    function is_attacked(sq, by_color) {
        // 1. Immediate Leapers (Pawn, Knight, King) - O(1)
        if (PAWN_ATTACKS[by_color^1][sq] & bitboards[by_color*6 + PAWN]) return true;
        if (KNIGHT_ATTACKS[sq] & bitboards[by_color*6 + KNIGHT]) return true;
        if (KING_ATTACKS[sq] & bitboards[by_color*6 + KING]) return true;

        // 2. Sliders (Rook, Bishop, Queen) - O(1) via Lookup
        let sliders = bitboards[by_color*6 + QUEEN] | bitboards[by_color*6 + ROOK] | bitboards[by_color*6 + BISHOP];
        
        // Only check sliding pieces that exist on the board
        while (sliders !== 0n) {
            let from = ctz(sliders);
            sliders &= sliders - 1n; // Pop bit
            
            // A. Check Geometric Alignment (Fast Boolean)
            if (ALIGNED[from][sq]) {
                // B. Check Piece Direction Capabilities
                let piece = board_arr[from] & 7;
                if (piece === ROOK) {
                    // Rooks cannot move diagonally
                    // (xor technique: if diff in rank AND diff in file, it's diagonal)
                    if (((from^sq)&7) && ((from>>3)!=(sq>>3))) continue; 
                }
                if (piece === BISHOP) {
                    // Bishops cannot move straight
                    // (if same rank OR same file, it's straight)
                    if (((from>>3)===(sq>>3)) || ((from&7)===(sq&7))) continue;
                }

                // C. Check Obstruction (Bitmask Intersection)
                // If the path between them is empty, it's an attack.
                if ((BETWEEN[from][sq] & get_occupied()) === 0n) return true;
            }
        }
        return false;
    }
    function is_checked(color) {
        if (typeof color === 'undefined') color = turn;
        var k = ctz(bitboards[color * 6 + KING]);
        return (k !== 64) && is_attacked(k, color ^ 1);
    }
    function generate_moves(options) {
        var moves = []; // Stores 32-bit Integers
        var us = turn, them = us ^ 1;
        var occ_us = get_color_occ(us), occ_them = get_color_occ(them);
        var all = occ_us | occ_them, empty = ~all;
        var pawns = bitboards[us * 6 + PAWN];

        // 1. Pawn Pushes
        var single = (us === WHITE) ? (pawns << 8n) : (pawns >> 8n);
        single &= empty;
        var bb = single;
        while (bb !== 0n) {
            let to = ctz(bb);
            bb &= bb - 1n;
            
            let from = (us === WHITE) ? to - 8 : to + 8;
            if (to < 8 || to >= 56) add_promo(moves, from, to, BITS.PROMOTION);
            else {
                add_move(moves, from, to, BITS.NORMAL);
                // Double Push
                if ((us === WHITE && to >= 16 && to <= 23) || (us === BLACK && to >= 40 && to <= 47)) {
                    let d = (us === WHITE) ? to + 8 : to - 8;
                    if ((all & MASKS[d]) === 0n) add_move(moves, from, d, BITS.BIG_PAWN);
                }
            }
        }
        
        // 2. Pawn Captures
        let capL = (us === WHITE) ? (pawns << 7n) & ~FILE_MASKS[7] : (pawns >> 9n) & ~FILE_MASKS[7];
        let capR = (us === WHITE) ? (pawns << 9n) & ~FILE_MASKS[0] : (pawns >> 7n) & ~FILE_MASKS[0];
        process_pawn_caps(moves, capL, occ_them, us, -1);
        process_pawn_caps(moves, capR, occ_them, us, 1);
        
        // 3. Piece Moves (Knight, King)
        let pieces = bitboards[us * 6 + KNIGHT];
        while (pieces !== 0n) { let f = ctz(pieces); pieces &= pieces - 1n; serialize_moves(moves, f, KNIGHT_ATTACKS[f] & ~occ_us, occ_them); }
        
        pieces = bitboards[us * 6 + KING];
        if (pieces !== 0n) { let f = ctz(pieces); serialize_moves(moves, f, KING_ATTACKS[f] & ~occ_us, occ_them); }
        
        // 4. Sliders (Rook, Queen, Bishop)
        [ROOK, QUEEN, BISHOP].forEach(type => {
            let p = bitboards[us * 6 + type];
            while (p !== 0n) {
                let f = ctz(p); 
                p &= p - 1n;
                serialize_moves(moves, f, get_slider_attacks(type, f, all) & ~occ_us, occ_them);
            }
        });

        // 5. Castling
        if (!options || options.legal !== false) {
             if (us === WHITE) {
                if ((castling & 1n) && !(all & (MASKS[5]|MASKS[6]))) {
                    if (!is_attacked(4, BLACK) && !is_attacked(5, BLACK) && !is_attacked(6, BLACK)) add_move(moves, 4, 6, BITS.KSIDE_CASTLE);
                }
                if ((castling & 2n) && !(all & (MASKS[1]|MASKS[2]|MASKS[3]))) {
                    if (!is_attacked(4, BLACK) && !is_attacked(3, BLACK) && !is_attacked(2, BLACK)) add_move(moves, 4, 2, BITS.QSIDE_CASTLE);
                }
            } else {
                 if ((castling & 4n) && !(all & (MASKS[61]|MASKS[62]))) {
                    if (!is_attacked(60, WHITE) && !is_attacked(61, WHITE) && !is_attacked(62, WHITE)) add_move(moves, 60, 62, BITS.KSIDE_CASTLE);
                }
                if ((castling & 8n) && !(all & (MASKS[57]|MASKS[58]|MASKS[59]))) {
                    if (!is_attacked(60, WHITE) && !is_attacked(59, WHITE) && !is_attacked(58, WHITE)) add_move(moves, 60, 58, BITS.QSIDE_CASTLE);
                }
            }
        }

        // 6. Filtering & Legality (Handles Integers)
        var final_moves = [];
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            
            // Filter by Square (if requested)
            if (options && options.square) {
                let f = m & 0x3F;
                if (sq_str(f) !== options.square) continue;
            }
            
            // Check Legality
            if (!options || options.legal !== false) {
                if (is_legal_fast(m)) final_moves.push(m);
            } else {
                final_moves.push(m);
            }
        }
        return final_moves;
    }
    function add_move(l, f, t, fl) { 
        // Pack into 32-bit Integer: [19:promo | 12:flags | 6:to | 0:from]
        l.push(f | (t << 6) | (fl << 12)); 
    }
    function add_promo(l, f, t, fl) { 
        // Unrolled for speed. Promos: Q(4), R(3), B(2), N(1)
        l.push(f | (t << 6) | (fl << 12) | (4 << 19)); 
        l.push(f | (t << 6) | (fl << 12) | (3 << 19)); 
        l.push(f | (t << 6) | (fl << 12) | (2 << 19)); 
        l.push(f | (t << 6) | (fl << 12) | (1 << 19)); 
    }   
    function serialize_moves(l, f, att, enemies) { 
        // Loop over bits without BigInt alloc overhead if possible, 
        // but here 'att' is BigInt, so we use standard bit twiddling.
        while (att !== 0n) { 
            let t = ctz(att); 
            att &= att - 1n; 
            // Check capture via bitmask (enemies is BigInt)
            // Note: enemies & MASKS[t] checks if 't' is occupied by enemy
            let isCap = (enemies & MASKS[t]) !== 0n;
            l.push(f | (t << 6) | ((isCap ? BITS.CAPTURE : BITS.NORMAL) << 12)); 
        } 
    }
    function process_pawn_caps(list, bb, enemies, us, offset) {
        // En Passant
        if (ep_square !== -1) {
            // Fast check: can any pawn capture EP?
            // us==WHITE ? (bb & mask[ep-9]) : ...
            // Re-using strict mask logic:
            let ep_mask = MASKS[ep_square];
            if ((bb & ep_mask) !== 0n) {
                let from = (us === WHITE) ? (offset === 1 ? ep_square - 9 : ep_square - 7) : (offset === 1 ? ep_square + 7 : ep_square + 9);
                if (from >= 0 && from < 64) add_move(list, from, ep_square, BITS.EP_CAPTURE);
            }
        }
        
        // Normal Captures
        bb &= enemies; // Intersect with enemy pieces
        while (bb !== 0n) {
            let to = ctz(bb);
            bb &= bb - 1n;
            
            let from = (us === WHITE) ? (offset === 1 ? to - 9 : to - 7) : (offset === 1 ? to + 7 : to + 9);
            if (from >= 0 && from < 64 && get_type_at(from, us) === PAWN) {
                // Check Promotion Rank (Row 0 or 7)
                if (to < 8 || to >= 56) add_promo(list, from, to, BITS.CAPTURE | BITS.PROMOTION);
                else add_move(list, from, to, BITS.CAPTURE);
            }
        }
    }
    function parse_nag(san) {
        var nag = "";
        // Extract annotation symbols
        var clean = san.replace(/([?!]+)/, function(m, p1) { 
            nag = p1; 
            return ""; 
        });
        // Clean remaining decorations
        clean = clean.replace(/[+#=]/g, "").trim(); 
        return { clean: clean, nag: nag };
    }
    function load_fen(fen) {
        var tokens = fen.split(/\s+/);
        bitboards.fill(0n);
        board_arr.fill(-1);
        
        var sq = 56;
        for (var i = 0; i < tokens[0].length; i++) {
            var char = tokens[0].charAt(i);
            if (char === "/") sq -= 16;
            else if (/\d/.test(char)) sq += parseInt(char, 10);
            else {
                var color = (char < "a") ? WHITE : BLACK;
                var type = CHAR_TO_PIECE[char.toLowerCase()];
                // Safety: Prevent writing out of bounds
                if (sq >= 0 && sq < 64) {
                    bitboards[color * 6 + type] |= MASKS[sq];
                    board_arr[sq] = (color << 3) | type;
                }
                sq++;
            }
        }
        
        turn = (tokens[1] === 'w') ? WHITE : BLACK;
        
        // Castling parsing
        castling = 0n;
        if (tokens[2].indexOf("K") > -1) castling |= 1n; 
        if (tokens[2].indexOf("Q") > -1) castling |= 2n;
        if (tokens[2].indexOf("k") > -1) castling |= 4n; 
        if (tokens[2].indexOf("q") > -1) castling |= 8n;
        
        // FIX: Handle '-' correctly for En Passant
        ep_square = (tokens[3] === '-' || !tokens[3]) ? -1 : str_to_sq(tokens[3]);
        
        half_moves = parseInt(tokens[4] || 0, 10);
        move_number = parseInt(tokens[5] || 1, 10);
        history = []; 

        // --- SANITIZATION (Fixes Ghost Flags) ---
        
        // 1. Strip Castling if King/Rooks are missing
        if (!(bitboards[WHITE*6 + KING] & MASKS[4])) castling &= ~3n; // No White King at e1
        if (!(bitboards[WHITE*6 + ROOK] & MASKS[7])) castling &= ~1n; // No White Rook at h1
        if (!(bitboards[WHITE*6 + ROOK] & MASKS[0])) castling &= ~2n; // No White Rook at a1

        if (!(bitboards[BLACK*6 + KING] & MASKS[60])) castling &= ~12n; // No Black King at e8
        if (!(bitboards[BLACK*6 + ROOK] & MASKS[63])) castling &= ~4n;  // No Black Rook at h8
        if (!(bitboards[BLACK*6 + ROOK] & MASKS[56])) castling &= ~8n;  // No Black Rook at a8
        
        // 2. Strip En Passant if no pawn is actually there to capture
        // (If ep_square is e3, there must be a black pawn at e4)
        if (ep_square !== -1) {
            let capturedPawnSq = (turn === WHITE) ? ep_square - 8 : ep_square + 8;
            let expectedPawn = (turn === WHITE) ? (BLACK*6 + PAWN) : (WHITE*6 + PAWN);
            if (!(bitboards[expectedPawn] & MASKS[capturedPawnSq])) {
                ep_square = -1;
            }
        }

        return true;
    }
    function generate_fen() {
        var empty = 0, fen = "";
        for (var r = 7; r >= 0; r--) {
            for (var f = 0; f < 8; f++) {
                var sq = r * 8 + f;
                var type = get_type_at(sq, WHITE);
                var color = WHITE;
                if (type === -1) { type = get_type_at(sq, BLACK); color = BLACK; }
                if (type === -1) empty++;
                else {
                    if (empty > 0) { fen += empty; empty = 0; }
                    var char = PIECE_TO_CHAR[type];
                    fen += (color === WHITE) ? char.toUpperCase() : char;
                }
            }
            if (empty > 0) { fen += empty; empty = 0; }
            if (r > 0) fen += "/";
        }
        var c = "";
        if (castling & 1n) c += "K"; if (castling & 2n) c += "Q";
        if (castling & 4n) c += "k"; if (castling & 8n) c += "q";
        c = c || "-";
        var ep = (ep_square === -1) ? "-" : sq_str(ep_square);
        return [fen, (turn === WHITE ? 'w' : 'b'), c, ep, half_moves, move_number].join(" ");
    }
    function find_move_by_coords(from, to, promo) {
        return build_move_direct(from, to, promo);
    }
    function get_san(m) {
        var from = m & 0x3F, to = (m >>> 6) & 0x3F, flags = (m >>> 12) & 0x7F, promo = (m >>> 19) & 0x7;
        
        if (flags & BITS.KSIDE_CASTLE) return "O-O"; 
        if (flags & BITS.QSIDE_CASTLE) return "O-O-O";

        var pChar = get_char_at(from);
        var s = (pChar !== 'p' ? pChar.toUpperCase() : "");
        
        var ambigFile = false, ambigRank = false;
        
        // Generate integer moves
        var ms = generate_moves({legal:true}); 

        for (var i = 0; i < ms.length; i++) {
            var other = ms[i]; // 'other' is an Integer
            var o_from = other & 0x3F;
            var o_to = (other >>> 6) & 0x3F;
            
            // Compare logic: Same destination, different source, same piece type
            if (o_from !== from && o_to === to && get_char_at(o_from) === pChar) {
                var mStr = SQ_STR[from], oStr = SQ_STR[o_from];
                if (mStr[0] === oStr[0]) ambigRank = true; else ambigFile = true;
            }
        }

        if (ambigFile) s += SQ_STR[from][0]; 
        else if (ambigRank) s += SQ_STR[from][1];
        
        if (flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
            if (pChar === 'p' && !ambigFile) s += SQ_STR[from][0];
            s += "x";
        }
        
        s += SQ_STR[to]; 
        if (flags & BITS.PROMOTION) s += "=" + PIECE_TO_CHAR[promo].toUpperCase();
        
        return s; 
    }
    function is_legal_fast(m) {
        var us = turn, them = us ^ 1;
        
        // UNPACK INTEGER: [0-5:from] [6-11:to] [12-18:flags] [19-21:promo]
        var from = m & 0x3F;
        var to = (m >>> 6) & 0x3F;
        var flags = (m >>> 12) & 0x7F;
        var promo = (m >>> 19) & 0x7;
        
        var piece = get_type_at(from, us); 
        
        // 1. Apply Move to Bitboards
        bitboards[us*6 + piece] &= ~MASKS[from];
        bitboards[us*6 + piece] |= MASKS[to];
        
        var cap_sq = to;
        var captured = -1;

        if (flags & BITS.CAPTURE) {
            captured = get_type_at(to, them);
            if (captured !== -1) bitboards[them*6 + captured] &= ~MASKS[to];
        } else if (flags & BITS.EP_CAPTURE) {
             cap_sq = us===WHITE ? to-8 : to+8;
             bitboards[them*6 + PAWN] &= ~MASKS[cap_sq];
        }

        if (flags & BITS.PROMOTION) {
             bitboards[us*6 + PAWN] &= ~MASKS[to];
             bitboards[us*6 + promo] |= MASKS[to];
        }

        if (flags & BITS.KSIDE_CASTLE) {
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            bitboards[us*6+ROOK] &= ~MASKS[rf]; bitboards[us*6+ROOK] |= MASKS[rt];
        } else if (flags & BITS.QSIDE_CASTLE) {
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            bitboards[us*6+ROOK] &= ~MASKS[rf]; bitboards[us*6+ROOK] |= MASKS[rt];
        }

        // 2. Check King Safety
        var king_sq = (piece === KING) ? to : ctz(bitboards[us*6 + KING]);
        // Safety: If king missing (shouldn't happen), assume unsafe
        var safe = (king_sq !== 64) && !is_attacked(king_sq, them);

        // 3. Revert Bitboards (Strictly Reverse Order)
        if (flags & BITS.KSIDE_CASTLE) {
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            bitboards[us*6+ROOK] &= ~MASKS[rt]; bitboards[us*6+ROOK] |= MASKS[rf];
        } else if (flags & BITS.QSIDE_CASTLE) {
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            bitboards[us*6+ROOK] &= ~MASKS[rt]; bitboards[us*6+ROOK] |= MASKS[rf];
        }

        if (flags & BITS.PROMOTION) {
             bitboards[us*6 + promo] &= ~MASKS[to];
             bitboards[us*6 + PAWN] |= MASKS[to];
        }

        if (flags & BITS.EP_CAPTURE) {
             bitboards[them*6 + PAWN] |= MASKS[cap_sq];
        } else if (flags & BITS.CAPTURE) {
             if (captured !== -1) bitboards[them*6 + captured] |= MASKS[to];
        }

        bitboards[us*6 + piece] &= ~MASKS[to];
        bitboards[us*6 + piece] |= MASKS[from];

        return safe;
    }
    function build_move_direct(from, to, promo) {       
        if (from === to) return null;       
        var us = turn;      
        var piece = get_type_at(from, us);       
        if (piece === -1) return null;       
        var them = us ^ 1;      
        var captured = get_type_at(to, them);       
        var flags = BITS.NORMAL;   
        
        // Sanitize Promotion to Integer
        var promoInt = 0;
        if (promo) {
            if (typeof promo === 'string') promoInt = CHAR_TO_PIECE[promo.toLowerCase()];
            else promoInt = promo;
        }

        if (piece === PAWN) {         
            var diff = us === WHITE ? to - from : from - to;            
            if (diff % 8 !== 0) { // Diagonal
                if (captured === -1 && to !== ep_square) return null;                
                flags = (to === ep_square) ? BITS.EP_CAPTURE : BITS.CAPTURE;             
            } 
            else { // Push              
                if (captured !== -1) return null;                
                if (diff === 16) flags = BITS.BIG_PAWN;             
            }           
            var rank = Math.floor(to / 8);            
            if (rank === 0 || rank === 7) {               
                flags |= BITS.PROMOTION;                
                if (!promoInt) promoInt = QUEEN;            
            }    
        }
        else if (piece === KING) {
            if (Math.abs(to - from) === 2) {
                if (to > from) flags = BITS.KSIDE_CASTLE;
                else flags = BITS.QSIDE_CASTLE;           
            } 
            else if (captured !== -1) flags = BITS.CAPTURE;       
        }
        else if (captured !== -1) flags = BITS.CAPTURE;     

        // PACK INTEGER: [from] | [to] | [flags] | [promo]
        var m = from | (to << 6) | (flags << 12) | (promoInt << 19);

        if (is_legal_fast(m)) return m;
        return null;
    }
    function make_move(m) {
        var us = turn, them = us ^ 1;
        
        // UNPACK using >>> to avoid sign issues
        var from = m & 0x3F;
        var to = (m >>> 6) & 0x3F;
        var flags = (m >>> 12) & 0x7F;
        var promo = (m >>> 19) & 0x7;
        
        var p_type = get_type_at(from, us);
        if (p_type === -1) return false;

        var cap = -1;
        if (flags & BITS.CAPTURE) cap = get_type_at(to, them);
        else if (flags & BITS.EP_CAPTURE) cap = PAWN;

        // BigInt Protection: explicit BigInt() cast on castling state
        history.push({ m: m, c: BigInt(castling), e: ep_square, h: half_moves, n: move_number, cap: cap });

        // 1. Move Piece
        bitboards[us*6 + p_type] &= ~MASKS[from]; 
        bitboards[us*6 + p_type] |= MASKS[to];
        board_arr[from] = -1;
        board_arr[to] = (us << 3) | p_type;
        
        // 2. Captures
        if (flags & BITS.CAPTURE) { 
            if (cap !== -1) bitboards[them*6 + cap] &= ~MASKS[to]; 
        } else if (flags & BITS.EP_CAPTURE) {
            let ep_sq = us===WHITE ? to-8 : to+8;
            bitboards[them*6 + PAWN] &= ~MASKS[ep_sq];
            board_arr[ep_sq] = -1; 
        }
        
        // 3. Promotion
        if (flags & BITS.PROMOTION) { 
            bitboards[us*6 + PAWN] &= ~MASKS[to]; 
            bitboards[us*6 + promo] |= MASKS[to]; 
            board_arr[to] = (us << 3) | promo;
        }

        // 4. Castling
        if (flags & BITS.KSIDE_CASTLE) { 
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61; 
            bitboards[us*6+ROOK] &= ~MASKS[rf]; bitboards[us*6+ROOK] |= MASKS[rt]; 
            board_arr[rf] = -1; board_arr[rt] = (us << 3) | ROOK;
        } else if (flags & BITS.QSIDE_CASTLE) { 
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59; 
            bitboards[us*6+ROOK] &= ~MASKS[rf]; bitboards[us*6+ROOK] |= MASKS[rt]; 
            board_arr[rf] = -1; board_arr[rt] = (us << 3) | ROOK;
        }
        
        // 5. Update Rights
        if (p_type === KING) castling &= (us === WHITE) ? ~3n : ~12n;
        if (p_type === ROOK) { 
            if (from === 0) castling &= ~2n; if (from === 7) castling &= ~1n; 
            if (from === 56) castling &= ~8n; if (from === 63) castling &= ~4n; 
        }
        if (flags & BITS.CAPTURE) { 
            if (to === 0) castling &= ~2n; if (to === 7) castling &= ~1n; 
            if (to === 56) castling &= ~8n; if (to === 63) castling &= ~4n; 
        }
        
        turn ^= 1; 
        ep_square = (flags & BITS.BIG_PAWN) ? ((us === WHITE) ? to - 8 : to + 8) : -1;
        if (p_type === PAWN || (flags & BITS.CAPTURE)) half_moves = 0; else half_moves++;
        if (turn === WHITE) move_number++;
        
        // We trust is_legal_fast was called before this, but if you need a double check:
        // if (is_checked(us)) { undo_move(); return false; }
        
        return true;
    }
    function undo_move() {
        var s = history.pop(); if (!s) return null;
        var m = s.m;
        
        // UNPACK using >>>
        var from = m & 0x3F;
        var to = (m >>> 6) & 0x3F;
        var flags = (m >>> 12) & 0x7F;
        
        turn ^= 1; var us = turn, them = us ^ 1;
        castling = s.c; ep_square = s.e; half_moves = s.h; move_number = s.n;
        
        var p_val = board_arr[to];
        var p_type = p_val & 7;

        if (flags & BITS.PROMOTION) {
            let promo = (m >>> 19) & 0x7;
            bitboards[us*6 + promo] &= ~MASKS[to];
            bitboards[us*6 + PAWN] |= MASKS[from];
            board_arr[to] = -1; 
            board_arr[from] = (us << 3) | PAWN;
        } else {
            if (p_type !== -1) { 
                bitboards[us*6 + p_type] &= ~MASKS[to];
                bitboards[us*6 + p_type] |= MASKS[from];
                board_arr[to] = -1;
                board_arr[from] = p_val;
            }
        }

        if (flags & BITS.CAPTURE) {
            if (s.cap !== -1) {
                bitboards[them*6 + s.cap] |= MASKS[to];
                board_arr[to] = (them << 3) | s.cap;
            }
        }
        else if (flags & BITS.EP_CAPTURE) {
            let ep_sq = us===WHITE ? to-8 : to+8;
            bitboards[them*6 + PAWN] |= MASKS[ep_sq];
            board_arr[ep_sq] = (them << 3) | PAWN;
        }

        if (flags & BITS.KSIDE_CASTLE) {
            let rf=us===WHITE?7:63, rt=us===WHITE?5:61;
            bitboards[us*6+ROOK] &= ~MASKS[rt]; bitboards[us*6+ROOK] |= MASKS[rf];
            board_arr[rt] = -1; board_arr[rf] = (us << 3) | ROOK;
        }
        else if (flags & BITS.QSIDE_CASTLE) {
            let rf=us===WHITE?0:56, rt=us===WHITE?3:59;
            bitboards[us*6+ROOK] &= ~MASKS[rt]; bitboards[us*6+ROOK] |= MASKS[rf];
            board_arr[rt] = -1; board_arr[rf] = (us << 3) | ROOK;
        }
        return m;
    }
    function to_obj(m, nag, known_san) {
        var from = m & 0x3F;
        var to = (m >>> 6) & 0x3F;
        var flags = (m >>> 12) & 0x7F;
        var promoInt = (m >>> 19) & 0x7;

        var f = "n";
        if (flags & BITS.KSIDE_CASTLE) f = "k";
        else if (flags & BITS.QSIDE_CASTLE) f = "q";
        else if ((flags & BITS.CAPTURE) && (flags & BITS.PROMOTION)) f = "cp";
        else if (flags & BITS.PROMOTION) f = "p"; 
        else if (flags & BITS.CAPTURE) f = "c";
        else if (flags & BITS.EP_CAPTURE) f = "e";
        else if (flags & BITS.BIG_PAWN) f = "b";

        var cap = undefined;
        if (flags & BITS.CAPTURE) {
             var t = get_type_at(to, turn^1);
             if (t !== -1) cap = PIECE_TO_CHAR[t];
        } else if (flags & BITS.EP_CAPTURE) cap = 'p';
        
        var obj = { 
            color: turn===WHITE?'w':'b', 
            from: sq_str(from), 
            to: sq_str(to), 
            flags: f, 
            piece: get_char_at(from), 
            san: known_san || get_san(m), 
            promotion: (flags & BITS.PROMOTION) ? PIECE_TO_CHAR[promoInt] : undefined, 
            captured: cap 
        };
        if (nag) obj.nag = nag;
        return obj;
    }
    function find_move_by_coords(from, to, promo) {
        return build_move_direct(from, to, promo);
    }
    function tr(san) {
        if (!san || typeof san !== 'string') return null;

        // 1. FAST CLEANUP (Manual scan from end to remove + # ! ?)
        var len = san.length;
        var end = len;
        while (end > 0) {
            var c = san.charCodeAt(end - 1);
            if (c === 43 || c === 35 || c === 33 || c === 63) end--; 
            else break;
        }
        var clean = san.substring(0, end).trim();

        // 2. CASTLING (Direct check)
        if (clean === "O-O" || clean === "0-0") return turn === WHITE ? build_move_direct(4, 6) : build_move_direct(60, 62);
        if (clean === "O-O-O" || clean === "0-0-0") return turn === WHITE ? build_move_direct(4, 2) : build_move_direct(60, 58);

        // 3. PARSE DESTINATION & PROMOTION (Scan from BACK)
        var promo = null;
        var destIndex = clean.length - 1;
        
        // Check for promotion (e.g. e8=Q, a8Q, b8=N)
        var lastChar = clean.charCodeAt(destIndex);
        // If last char is B, N, R, Q (66, 78, 82, 81) or n, b, r, q
        if ((lastChar >= 66 && lastChar <= 82) || (lastChar >= 98 && lastChar <= 114)) { 
             var prev = clean.charCodeAt(destIndex - 1);
             // It is a promotion ONLY if the char before it is a Digit (1 or 8) or '='
             if ((prev >= 49 && prev <= 56) || prev === 61) {
                 promo = clean.charAt(destIndex).toLowerCase();
                 destIndex--;
                 if (clean.charCodeAt(destIndex) === 61) destIndex--; // Skip '='
             }
        }

        // destIndex now points to the Rank digit (1-8)
        // destIndex-1 points to the File letter (a-h)
        var toRank = clean.charCodeAt(destIndex) - 49; // '1' is 49
        var toFile = clean.charCodeAt(destIndex - 1) - 97; // 'a' is 97
        var to = toRank * 8 + toFile;

        // 4. PARSE PIECE TYPE (Scan from FRONT)
        var pieceChar = 0;
        var cursor = 0;
        var first = clean.charCodeAt(0);
        
        // If starts with Uppercase (B, K, N, Q, R), it's a piece. Otherwise Pawn.
        if (first >= 66 && first <= 82) { 
            pieceChar = first;
            cursor = 1;
        }
        var type = pieceChar ? CHAR_TO_PIECE[String.fromCharCode(pieceChar).toLowerCase()] : PAWN;

        // 5. REVERSE LOOKUP (Find WHO can move to 'to')
        var us = turn;
        var candidates = 0n;

        if (type === PAWN) {
            // A) Capture Logic (Has 'x' OR dest is occupied OR dest is ep_square)
            // We verify 'x' manually to handle PGNs like "exd5"
            var isCapture = (clean.indexOf('x') !== -1) || (get_type_at(to, us ^ 1) !== -1) || (to === ep_square);
            
            if (isCapture) {
                // Check pawns that attack 'to'
                candidates = PAWN_ATTACKS[us ^ 1][to] & bitboards[us * 6 + PAWN];
            } else {
                // B) Push Logic
                var from1 = us === WHITE ? to - 8 : to + 8;
                if (from1 >= 0 && from1 < 64 && get_type_at(from1, us) === PAWN) candidates |= MASKS[from1];
                
                // Double Push
                var from2 = us === WHITE ? to - 16 : to + 16;
                var rankCheck = us === WHITE ? 3 : 4; 
                var mid = us === WHITE ? to - 8 : to + 8;
                if (Math.floor(to / 8) === rankCheck && get_type_at(from2, us) === PAWN && get_type_at(mid, us) === -1 && get_type_at(from1, us) === -1) {
                    candidates |= MASKS[from2];
                }
            }
        } else {
            // Piece Logic
            if (type === KNIGHT) candidates = KNIGHT_ATTACKS[to];
            else if (type === KING) candidates = KING_ATTACKS[to];
            else {
                let pieces = bitboards[us * 6 + type];
                var occ = get_occupied();
                
                while (pieces !== 0n) {
                    let from = ctz(pieces);
                    pieces &= pieces - 1n;
                    
                    if (ALIGNED[from][to]) {
                        let r1 = from >> 3, f1 = from & 7, r2 = to >> 3, f2 = to & 7;
                        let isDiag = (Math.abs(r1 - r2) === Math.abs(f1 - f2));

                        if (type === ROOK && isDiag) continue;
                        if (type === BISHOP && !isDiag) continue;
                        if ((BETWEEN[from][to] & occ) === 0n) candidates |= MASKS[from];
                    }
                }
            }
            if (type === KNIGHT || type === KING) candidates &= bitboards[us * 6 + type];
        
        }

        // 6. FILTER CANDIDATES (Disambiguation)
        while (candidates !== 0n) {
            var from = ctz(candidates);
            candidates &= candidates - 1n; // Pop LS1B

            // Disambiguation Check (Crucial for "Nbd7" or "R1e4")
            // If there are characters between the Piece(cursor) and Dest(destIndex-1),
            // those are disambiguation chars (file 'a-h' or rank '1-8').
            var match = true;
            if (destIndex - 1 > cursor) {
                var sStr = sq_str(from);
                for (var k = cursor; k < destIndex - 1; k++) {
                    var c = clean.charCodeAt(k);
                    if (c === 120) continue; // Skip 'x' (120)
                    
                    if (c >= 97 && c <= 104) { // File (a-h)
                        if (sStr.charCodeAt(0) !== c) { match = false; break; }
                    } else if (c >= 49 && c <= 56) { // Rank (1-8)
                        if (sStr.charCodeAt(1) !== c) { match = false; break; }
                    }
                }
            }

            if (match) {
                var m = build_move_direct(from, to, promo);
                if (m) return m;
            }
        }
        return null;
    }
    load_fen(fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    return {
        WHITE: 'w', BLACK: 'b',
        load: function(r) { return load_fen(r); },
        reset: function() { return load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"); },
	    load_pgn: function(pgn) {
        log("PGN", "Loading..."); load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
        var len = pgn.length, i = 0;
        while (i < len) {
            var c = pgn.charCodeAt(i);
            if (c <= 32) { i++; continue; } // Skip space
            if (c === 91) { i++; while (i < len && pgn.charCodeAt(i) !== 93) i++; i++; continue; }
            if (c === 123) { i++; while (i < len && pgn.charCodeAt(i) !== 125) i++; i++; continue; }
            if (c === 40) { var depth = 1; i++; while (i < len && depth > 0) { var cc = pgn.charCodeAt(i); if (cc === 40) depth++; else if (cc === 41) depth--; i++; } continue; }
            var start = i; 
            while (i < len) { var cc = pgn.charCodeAt(i); if (cc <= 32 || cc === 93 || cc === 125 || cc === 41 || cc === 40) break; i++; }
            var word = pgn.substring(start, i);
            var firstChar = word.charCodeAt(0);
            if (firstChar >= 49 && firstChar <= 57) { if (word.indexOf('.') !== -1 || word.indexOf('-') !== -1) continue; }
            if (word === "*") continue;
            
            // Direct Engine Call
            var m = tr(word);
            if (m) { 
                if (!make_move(m)) { error("PGN", "Illegal move: " + word); return false; } 
            }
        }
        return true;
    },
        moves: function(o) { var ms = generate_moves(o); return (o && o.verbose) ? ms.map(to_obj) : ms.map(get_san); },
        move: function(o) {
        if (!o) return null;
        
			var m = null;
        
			var nag = "";
        
			var clean_san = null;

        
			if (typeof o === 'string') {
            
				var parsed = parse_nag(o);
            
				nag = parsed.nag;
            
				clean_san = parsed.clean;

            
				if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(clean_san)) {
            
					let f = str_to_sq(clean_san.substring(0,2));
               
					let t = str_to_sq(clean_san.substring(2,4));
               
					let p = clean_san.length === 5 ? clean_san[4] : null;
         
					m = build_move_direct(f, t, p);
                clean_san = null;
				} else {
                m = tr(clean_san);
            }
        } else {
				let f = (typeof o.from === 'number') ? o.from : str_to_sq(o.from);
            
				let t = (typeof o.to === 'number') ? o.to : str_to_sq(o.to);
         
				m = build_move_direct(f, t, o.promotion);
        }

    
			if (m === null) { error("INVALID_MOVE", o); return null; }

      
			var ret = to_obj(m, nag, clean_san);
        make_move(m);

      
			if (!clean_san && is_checked(turn)) {
           
				if (generate_moves({legal:true}).length === 0) ret.san += "#";
      
				else ret.san += "+";
        }
        if (nag) { ret.san += nag; ret.nag = nag; }
     
			return ret;
    
        },
        undo: function() {return undo_move();},
        get: function(sq) { 
            var idx = str_to_sq(sq); if (idx === -1) return null;
            var t = get_type_at(idx, WHITE); if (t !== -1) return { type: PIECE_TO_CHAR[t], color: 'w' };
            t = get_type_at(idx, BLACK); if (t !== -1) return { type: PIECE_TO_CHAR[t], color: 'b' };
            return null;
        },
        fen: function() { return generate_fen(); },
        board: function() {
            var b = [];
            for (var r = 0; r < 8; r++) {
                var row = [];
                for (var f = 0; f < 8; f++) {
                    var sq = (7 - r) * 8 + f;
                    var p = null;
                    var t = get_type_at(sq, WHITE);
                    if (t !== -1) p = { type: PIECE_TO_CHAR[t], color: 'w' };
                    else { t = get_type_at(sq, BLACK); if (t !== -1) p = { type: PIECE_TO_CHAR[t], color: 'b' }; }
                    row.push(p);
                }
                b.push(row);
            }
            return b;
        },
        turn: function() { return turn===WHITE?'w':'b'; },
        in_check: function() { return is_checked(turn); },
        in_checkmate: function() { return is_checked(turn) && generate_moves({legal:true}).length === 0; },
        in_stalemate: function() { return !is_checked(turn) && generate_moves({legal:true}).length === 0; },
        in_draw: function() { return half_moves >= 100 || (!is_checked(turn) && generate_moves({legal:true}).length === 0); },
        insufficient_material: function() { return false; },
        game_over: function() { var ms = generate_moves({legal:true}); return ms.length === 0 || half_moves >= 100; },
        validate_fen: function(r) { return { valid: true, error_number: 0, error: 'No errors.' }; },
		history: function(o) {
            var hist = [];
            for (var i = 0; i < history.length; i++) {
                hist.push((o && o.verbose) ? to_obj(history[i].m) : get_san(history[i].m));
            }
            return hist;
        }
    }
};