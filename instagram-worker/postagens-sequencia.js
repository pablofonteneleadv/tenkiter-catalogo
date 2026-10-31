import { DurableObject } from 'cloudflare:workers';
import { processarPostagens } from './worker.js';

// Um coordenador da fila desta loja: serializa recibos e continua partes sem o
// intervalo editorial. Não atende interface, uploads nem mensagens de clientes.
export class PostagensSequenciais extends DurableObject {
  async acordar() {
    const atual=await this.ctx.storage.getAlarm();
    if(atual===null||atual>Date.now()+1000)await this.ctx.storage.setAlarm(Date.now()+1000);
  }
  async alarm() {
    const r=await processarPostagens(this.env);
    if(r.erro)throw Error('A fila não pôde ser consultada; repetir com o mesmo recibo.');
    if(r.continuar)await this.ctx.storage.setAlarm(Date.now()+3000);
  }
}
