import { DurableObject } from 'cloudflare:workers';
import { processarPostagens, inserirMidiaAntesLocal_ } from './worker.js';

// Um coordenador da fila desta loja: serializa recibos e continua partes sem o
// intervalo editorial. Reagendamentos compartilham a mesma ordem do ciclo de envio.
// Não atende uploads nem mensagens de clientes.
export class PostagensSequenciais extends DurableObject {
  #fila=Promise.resolve();
  #serializar(f){const trabalho=this.#fila.then(f);this.#fila=trabalho.catch(()=>{});return trabalho;}
  async reorganizarMidias({ps,desejado,simular=false,imediato=false}){
    return this.#serializar(async()=>{const r=await inserirMidiaAntesLocal_(this.env,ps,desejado,(body,status=200)=>Response.json(body,{status}),simular,imediato);return {status:r.status,body:await r.json()};});
  }
  async saude(){return {ok:true,versao:'partes-v1',alarme:await this.ctx.storage.getAlarm()};}
  async acordar() {
    const atual=await this.ctx.storage.getAlarm();
    if(atual===null||atual>Date.now()+1000)await this.ctx.storage.setAlarm(Date.now()+1000);
  }
  async alarm() {return this.#serializar(async()=>{
    const r=await processarPostagens(this.env);
    if(r.erro)throw Error('A fila não pôde ser consultada; repetir com o mesmo recibo.');
    if(r.continuar)await this.ctx.storage.setAlarm(Date.now()+3000);
  });}
}
