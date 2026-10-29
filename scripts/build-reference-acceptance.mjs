import {buildReferenceAcceptance} from './reference-acceptance.mjs';
const report=await buildReferenceAcceptance();console.log(JSON.stringify({proofCurrent:report.proofCurrent,...report.counts}));
