"""Synthesize exact lesson scripts; cache only matching text/voice/hash triples."""
import asyncio, hashlib, json, sys, unicodedata
from pathlib import Path
import edge_tts
import edge_tts.communicate as communicate
from edge_tts.constants import TRUSTED_CLIENT_TOKEN
from edge_tts.version import __version__

if __version__ != '7.2.8':
    raise SystemExit('Requires edge-tts==7.2.8; revalidate the endpoint adapter before upgrading.')
communicate.WSS_URL = 'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=' + TRUSTED_CLIENT_TOKEN

def normal(s):
    return ''.join(c for c in s if unicodedata.category(c)[0] in 'LN').lower()

async def main():
    jobs_file=Path(sys.argv[1]); cache=Path(sys.argv[2]); cache.mkdir(parents=True,exist_ok=True)
    jobs=json.loads(jobs_file.read_text()); semaphore=asyncio.Semaphore(2); result={}
    async def make(key,job):
        fingerprint=hashlib.sha256(json.dumps(job,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        mp3=cache/(fingerprint+'.mp3'); meta=cache/(fingerprint+'.json')
        if mp3.exists() and meta.exists():
            old=json.loads(meta.read_text())
            if old.get('sha256')==hashlib.sha256(mp3.read_bytes()).hexdigest() and old.get('job')==job:
                result[key]={**old,'path':str(mp3.resolve())}; return
        async with semaphore:
            for attempt in range(4):
                try:
                    data=bytearray(); spoken=[]
                    tts=edge_tts.Communicate(job['text'],job['voice'],rate=job['rate'],pitch=job['pitch'],boundary='SentenceBoundary')
                    async for item in tts.stream():
                        if item['type']=='audio': data.extend(item['data'])
                        elif item['type']=='SentenceBoundary': spoken.append(item['text'])
                    if len(data)<500 or normal(''.join(spoken))!=normal(job['text']):
                        raise ValueError('Incomplete audio or spoken text mismatch')
                    payload={'job':job,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'fingerprint':fingerprint}
                    mp3.write_bytes(data);meta.write_text(json.dumps(payload,ensure_ascii=False)+'\n')
                    result[key]={**payload,'path':str(mp3.resolve())}
                    print('Audio ready: '+key,flush=True);return
                except Exception as err:
                    if attempt==3: raise RuntimeError('Speech failed for '+key+' ('+type(err).__name__+')') from None
                    await asyncio.sleep(2**attempt)
    await asyncio.gather(*(make(k,v) for k,v in jobs.items()))
    jobs_file.with_suffix('.manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__': asyncio.run(main())
