/* Catálogos locais da ficha: 184 municípios do Ceará (CSV municipios-brasileiros) e sugestões não exaustivas de Crateús. */
(function (root) {
  'use strict';
  const DADOS = {"municipios":["Abaiara","Acarape","Acaraú","Acopiara","Aiuaba","Alcântaras","Altaneira","Alto Santo","Amontada","Antonina do Norte","Apuiarés","Aquiraz","Aracati","Aracoiaba","Ararendá","Araripe","Aratuba","Arneiroz","Assaré","Aurora","Baixio","Banabuiú","Barbalha","Barreira","Barro","Barroquinha","Baturité","Beberibe","Bela Cruz","Boa Viagem","Brejo Santo","Camocim","Campos Sales","Canindé","Capistrano","Caridade","Caririaçu","Cariré","Cariús","Carnaubal","Cascavel","Catarina","Catunda","Caucaia","Cedro","Chaval","Chorozinho","Choró","Coreaú","Crateús","Crato","Croatá","Cruz","Deputado Irapuan Pinheiro","Ererê","Eusébio","Farias Brito","Forquilha","Fortaleza","Fortim","Frecheirinha","General Sampaio","Granja","Granjeiro","Graça","Groaíras","Guaiúba","Guaraciaba do Norte","Guaramiranga","Hidrolândia","Horizonte","Ibaretama","Ibiapina","Ibicuitinga","Icapuí","Icó","Iguatu","Independência","Ipaporanga","Ipaumirim","Ipu","Ipueiras","Iracema","Irauçuba","Itaitinga","Itaiçaba","Itapajé","Itapipoca","Itapiúna","Itarema","Itatira","Jaguaretama","Jaguaribara","Jaguaribe","Jaguaruana","Jardim","Jati","Jijoca de Jericoacoara","Juazeiro do Norte","Jucás","Lavras da Mangabeira","Limoeiro do Norte","Madalena","Maracanaú","Maranguape","Marco","Martinópole","Massapê","Mauriti","Meruoca","Milagres","Milhã","Miraíma","Missão Velha","Mombaça","Monsenhor Tabosa","Morada Nova","Moraújo","Morrinhos","Mucambo","Mulungu","Nova Olinda","Nova Russas","Novo Oriente","Ocara","Orós","Pacajus","Pacatuba","Pacoti","Pacujá","Palhano","Palmácia","Paracuru","Paraipaba","Parambu","Paramoti","Pedra Branca","Penaforte","Pentecoste","Pereiro","Pindoretama","Piquet Carneiro","Pires Ferreira","Poranga","Porteiras","Potengi","Potiretama","Quiterianópolis","Quixadá","Quixelô","Quixeramobim","Quixeré","Redenção","Reriutaba","Russas","Saboeiro","Salitre","Santa Quitéria","Santana do Acaraú","Santana do Cariri","Senador Pompeu","Senador Sá","Sobral","Solonópole","São Benedito","São Gonçalo do Amarante","São João do Jaguaribe","São Luís do Curu","Tabuleiro do Norte","Tamboril","Tarrafas","Tauá","Tejuçuoca","Tianguá","Trairi","Tururu","Ubajara","Umari","Umirim","Uruburetama","Uruoca","Varjota","Viçosa do Ceará","Várzea Alegre"],"bairrosCrateus":["Altamira","Boa Vista","Bom Retiro","Cajás","Campo Velho","Campos Belos","Centro","Cidade 2000","Cidade Nova","Fátima I","Fátima II","Ibiapaba","Ipase","José Rosa","Maratoan","Morada dos Ventos","Nova Terra","Palmeiras","Paraíso","Patriarcas","Pinheiros","Planaltina","Planalto","Ponte Preta","Príncipe Imperial","Santa Fé","Santa Luzia","São José","São Vicente","Veremos","Venâncios"],"distritosCrateus":["Crateús","Assis","Curral Velho","Ibiapaba","Irapuá","Lagoa das Pedras","Montenebo","Oiticica","Realejo","Santana","Poti","Santo Antônio","Tucuns"],"municipiosRegiao":["Ararendá","Catunda","Crateús","Hidrolândia","Independência","Ipaporanga","Ipueiras","Monsenhor Tabosa","Nova Russas","Novo Oriente","Poranga","Santa Quitéria","Tamboril"]};
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  const cidades = ['Crateús', 'Interior'].concat(DADOS.municipios.filter(n => n !== 'Crateús').sort(collator.compare));
  const unicos = valores => {
    const vistos = new Set(), saida = [];
    (valores || []).forEach(v => {
      const texto = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
      if (!texto) return;
      const chave = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
      if (vistos.has(chave)) return;
      vistos.add(chave); saida.push(texto);
    });
    return saida.sort(collator.compare);
  };
  const tokens = v => String(v == null ? '' : v).split(/[,;|·]/).map(x => x.trim()).filter(Boolean);
  function tamanhosDoProduto(produto, api) {
    const t = api && api.TKTamanhos;
    if (t && (typeof t.cliente === 'function' || typeof t.ler === 'function')) {
      const d = typeof t.cliente === 'function' ? t.cliente(String(produto && produto.Tamanhos || ''), produto && produto.Genero) : t.ler(produto && produto.Tamanhos || '');
      return unicos(d.valores || [].concat(d.etiqueta || [], d.idades || [], d.numeros || [], (d.antigos || []).flatMap(x => x.split(/[·;/]+/))));
    }
    return unicos(tokens(produto && produto.Tamanhos));
  }
  function opcoesCatalogo(produtos, apis) {
    apis = apis || (root || {});
    const ativos = (Array.isArray(produtos) ? produtos : []).filter(p => !p || !p.Status || /^ativo$/i.test(String(p.Status)));
    const tamanhos = [], generos = [], tecidos = [], cores = [];
    ativos.forEach(p => {
      tamanhos.push(...tamanhosDoProduto(p, apis));
      generos.push(...tokens(p && p.Genero));
      const t = apis.TKTecido;
      if (t && typeof t.ler === 'function') {
        const tecido = t.ler(p);
        if (tecido) tecidos.push(tecido);
      }
      cores.push(...tokens(p && p.Cores));
    });
    return { tamanhos: unicos(tamanhos), generos: unicos(generos), tecidos: unicos(tecidos), cores: unicos(cores) };
  }
  function comoPerfil(ficha, cidadesValidas) {
    ficha = ficha && typeof ficha === 'object' ? ficha : {};
    const origem = ficha.perfil && typeof ficha.perfil === 'object' ? ficha.perfil : {};
    const pref = origem.preferencias && typeof origem.preferencias === 'object' ? origem.preferencias : {};
    let cidade = String(origem.cidade || '').trim(), bairro = String(origem.bairro || '').trim();
    let municipio = String(origem.municipio || '').trim(), localidade = String(origem.localidade || '').trim();
    const legacy = String(ficha.cidade || '').trim();
    if (!cidade && legacy) {
      const cidadesSet = new Set(cidadesValidas || cidades);
      if (cidadesSet.has(legacy)) cidade = legacy;
      else {
        const partes = legacy.split(/\s+[—–]\s+/, 2);
        if (partes.length === 2 && cidadesSet.has(partes[0])) { cidade = partes[0]; bairro = bairro || partes[1]; }
        else cidade = legacy;
      }
    }
    const tamanhos = Array.isArray(pref.tamanhos) ? pref.tamanhos : tokens(ficha.tamanhos);
    return {
      cidade, municipio, bairro, localidade,
      preferencias: {
        tamanhos: unicos(tamanhos),
        generos: unicos(Array.isArray(pref.generos) ? pref.generos : []),
        tecidos: unicos(Array.isArray(pref.tecidos) ? pref.tecidos : []),
        cores: unicos(Array.isArray(pref.cores) ? pref.cores : [])
      }
    };
  }
  const api = Object.freeze({
    cidades: Object.freeze(cidades),
    sugestoesBairrosCrateus: Object.freeze(DADOS.bairrosCrateus.slice()),
    sugestoesDistritosCrateus: Object.freeze(DADOS.distritosCrateus.slice()),
    sugestoesMunicipiosInterior: Object.freeze(DADOS.municipiosRegiao.slice()),
    cobertura: 'Bairros e localidades são sugestões parciais; o campo aceita texto livre.',
    opcoesCatalogo, comoPerfil, unicos
  });
  if (root) root.TKMensagensFicha = api;
})(typeof window !== 'undefined' ? window : globalThis);
