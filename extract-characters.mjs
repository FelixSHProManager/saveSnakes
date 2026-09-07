/**
 * 从所有 *故事文本.md 中提取出场人物与事迹
 * 策略：白名单角色 + page_001 摘要事迹 + 正文描述句
 */
import fs from 'fs';
import path from 'path';

const ARCHIVE = path.resolve('archive');
const OUT = path.resolve('人物事迹表.md');

/** 核心角色身份（手工整理） */
const CHAR_DESC = {
  小蛇思思: '是一条聪明善良、穿蓝裙子的小蛇，常担任班长与侦探队长',
  魔法喵酱咪: '是一只戴蝴蝶结、胸前有星星徽章的魔法猫，常任学习委员',
  魔法喵小菊: '是戴白手套、出身「卫生世家」的魔法猫，常任卫生委员',
  魔法喵咪咪: '是一只活泼的魔法猫，擅长手速与各类竞技',
  魔法喵乖乖: '是一只穿背带裤的小黑猫，擅长画黑板报的宣传委员',
  乖乖: '同魔法喵乖乖，穿背带裤、爱画黑板报的小黑猫',
  壮壮: '是肌肉鼓鼓、力气很大的体育委员',
  壮壮喵: '是壮壮的魔法猫形态/同伴，同样力大无穷',
  孔雀老师: '是彩虹森林小学的魔法老师，尾羽可当讲台',
  猫头鹰老师: '是森林学校的猫头鹰老师',
  青蛙老师: '是体育/运动相关的青蛙老师',
  熊猫老师: '是熊猫老师',
  俏小妹: '是一条会独特才艺、曾被误解的小蛇',
  小蛇阿云: '是一条在云朵学校上学的小蛇',
  小鹰阿风: '是与小蛇阿云搭档的小鹰',
  小蛇阿宅: '是一条原本内向、在冒险中变得勇敢开朗的小蛇',
  小鹰阿翔: '是帮助阿宅乘冒险号展开冒险的小鹰',
  小鹰丁丁: '是与思思、小菊一起接受凤凰挑战的小鹰',
  小兔子跳跳: '是一只发现毒花陷阱、协助警察破案的兔子侦探',
  冰川王: '是偷走超能力的反派冰川之王',
  叶丽丝: '是侦探故事中的对手/反派',
  九尾狐: '是经营茶室的九尾狐',
  小马: '是与九尾狐合作经营茶室的小马',
  火苗队长: '是火焰/消防相关的队长角色',
  小火龙: '是一条小火龙角色',
  小松鼠: '是一只小松鼠',
  小石狮: '是一只小石狮',
  小蝴蝶: '是一只小蝴蝶',
  小蚂蚁: '是一只小蚂蚁',
  小金鱼: '是一条小金鱼',
  小熊猫: '是一只小熊猫',
  小狮子: '是一只小狮子',
  小鸭子: '是一只小鸭子',
  小橘子: '是魔法喵小菊的昵称/变体',
  超能侦探: '是超能大侦探系列中的侦探角色',
  魔法侦探: '是魔法侦探系列中的侦探角色',
};

/** 别名 → 规范名 */
const ALIAS = {
  思思: '小蛇思思',
  酱咪: '魔法喵酱咪',
  小菊: '魔法喵小菊',
  咪咪: '魔法喵咪咪',
  阿云: '小蛇阿云',
  阿风: '小鹰阿风',
  阿宅: '小蛇阿宅',
  阿翔: '小鹰阿翔',
  丁丁: '小鹰丁丁',
  跳跳: '小兔子跳跳',
  乖乖: '魔法喵乖乖',
  小橘子: '魔法喵小橘子',
  超能大侦探: '超能侦探',
};

/** 从全库扫描构建白名单 */
function buildWhitelist(files) {
  const freq = new Map();
  const patterns = [
    /小蛇思思/g,
    /魔法喵酱咪/g,
    /魔法喵小菊/g,
    /魔法喵小橘子/g,
    /魔法喵咪咪/g,
    /魔法喵乖乖/g,
    /小蛇[\u4e00-\u9fff]{1,2}(?=[，。；：！？、\s""''\u201c\u201d]|$)/g,
    /小[\u4e00-\u9fff]{1,2}(?:鹰|兔|猫|狮|马|熊|虎|龙|猴|猪|牛|羊|鸡|鸭|鱼|鸟|狐|狼|象|鹿|鼠|豹|蛙|龟|蜂|蝶|蚁|鹤|燕|雀|鸽)(?=[\u4e00-\u9fff]{0,2}[，。；：！？、\s""''\u201c\u201d]|$)/g,
    /[\u4e00-\u9fff]{2,4}老师/g,
    /[\u4e00-\u9fff]{2,4}王(?=[，。；：！？、\s""''\u201c\u201d]|$)/g,
    /[\u4e00-\u9fff]{2,4}侦探/g,
    /[\u4e00-\u9fff]{2,4}队长/g,
    /九尾狐/g,
    /叶丽丝/g,
    /俏小妹/g,
    /壮壮喵/g,
    /壮壮/g,
    /乖乖/g,
    /火苗队长/g,
    /小火龙/g,
    /小松鼠/g,
    /小石狮/g,
    /小蝴蝶/g,
    /小蚂蚁/g,
    /小金鱼/g,
    /小熊猫/g,
    /小狮子/g,
    /小鸭子/g,
    /超能侦探/g,
    /魔法侦探/g,
  ];

  const badSuffix = /^(.+[和与的在从向把被让给对到是了就也还都又再才只很更最])$/;
  const badNames = new Set([
    '小蛇和', '小蛇的', '小蛇在', '小蛇从', '小蛇带', '小蛇用', '小蛇甩', '小蛇晃', '小蛇摇', '小蛇盘',
    '小蛇正', '小蛇一', '小蛇就', '小蛇发', '小蛇姐', '小蛇妹', '小蛇兄', '小蛇弟', '小蛇空', '小蛇魔',
    '小蛇俏', '小蛇侦', '小蛇小', '小蛇和魔', '小蛇和猫', '小蛇姐妹', '小蛇兄妹', '思思带领侦探',
    '魔法喵', '三只魔法喵', '两只魔法喵', '四只魔法喵', '五只魔法喵', '所有魔法喵', '带领魔法喵',
    '躲避孔雀老师', '营救孔雀老师', '体育青蛙老师', '兔子侦探', '协助警察', '智斗保安', '伙伴智斗保安',
    '回被冰川王', '战胜冰川王', '狐和小马', '魔法喵班', '镜的魔法喵', '结的魔法喵', '色的魔法喵',
    '思和魔法喵', '蛇和魔法喵', '小蛇和魔法', '魔法喵救老师', '魔法喵酱咪的', '魔法喵咪咪的',
    '魔法喵酱咪推', '魔法喵酱咪甩', '魔法喵咪咪甩', '魔法喵咪咪举', '魔法喵乖乖推',
    '的猫头鹰老师', '当孔雀老师', '看见孔雀老师', '围着孔雀老师', '们的孔雀老师', '随着孔雀老师',
    '镜的熊猫老师', '学猫头鹰老师', '青蛙体育老师', '是超能大侦探', '小蛇队长',
  ]);

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    for (const re of patterns) {
      re.lastIndex = 0;
      for (const m of content.matchAll(re)) {
        let name = m[0];
        if (badNames.has(name)) continue;
        if (badSuffix.test(name)) continue;
        if (name.length < 2 || name.length > 8) continue;
        freq.set(name, (freq.get(name) || 0) + 1);
      }
    }
    // 短别名
    for (const a of ['思思', '酱咪', '小菊', '咪咪', '阿云', '阿风', '阿宅', '阿翔', '丁丁', '跳跳']) {
      if (content.includes(a)) freq.set(a, (freq.get(a) || 0) + 1);
    }
  }

  const whitelist = new Set(Object.keys(CHAR_DESC));
  for (const [name, count] of freq) {
    if (count >= 2) whitelist.add(name);
  }
  return whitelist;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('故事文本.md')) acc.push(p);
  }
  return acc;
}

function canonical(name) {
  return ALIAS[name] || name;
}

function parseStory(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const storyName = path.basename(path.dirname(filePath)).replace(/_\d+$/, '');
  const m = content.match(/page_001：(.+)/);
  let title = storyName;
  let summary = '';
  if (m) {
    const parts = m[1].split(/[；;]/);
    title = parts[0]?.trim() || storyName;
    summary = parts.length > 1 ? parts.slice(1).join('；').trim() : '';
  }
  const body = content.replace(/page_\d+：/g, '\n');
  return { storyName, title, summary, body, content };
}

function findCharactersInStory(content, whitelist) {
  const found = new Set();
  const searchNames = [...whitelist, ...Object.keys(ALIAS)];
  // 长名优先
  const sorted = searchNames.sort((a, b) => b.length - a.length);
  for (const raw of sorted) {
    if (content.includes(raw)) {
      found.add(canonical(raw));
    }
  }
  return [...found];
}

function extractDeedForChar(summary, body, name, storyName, aliases) {
  const allNames = [name, ...aliases.filter((a) => a !== name)];

  // 优先从摘要中提取含该角色的子句
  if (summary) {
    const clauses = summary.split(/[，,；;。！？]/);
    for (const c of clauses) {
      if (allNames.some((n) => c.includes(n))) return c.trim();
    }
    if (allNames.some((n) => summary.includes(n))) return summary;
  }

  // 从正文找关键句（优先含动作动词的句子）
  const actionRe = /(?:带领|帮助|战胜|赢得|发现|破解|营救|保护|完成|通过|参加|克服|智斗|合作|寻找|逃离|守护|阻止|拯救|组织|指挥|表演|学习|发明|收集|对抗|突破|执行|智破|用智慧|用分身|当|成为|获得|找回|化解|展示|觉醒|证明|识破|躲避|收集|夺回|破解|潜入|突破)/;
  const sentences = body.split(/[。！？\n]/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (allNames.some((n) => s.includes(n)) && actionRe.test(s) && s.length >= 8 && s.length <= 100) {
      return s;
    }
  }
  for (const s of sentences) {
    if (allNames.some((n) => s.includes(n)) && s.length >= 8 && s.length <= 100) {
      return s;
    }
  }

  return summary || `在《${storyName}》中出场`;
}

function getDescription(name, texts) {
  if (CHAR_DESC[name]) return CHAR_DESC[name];
  if (name.startsWith('小蛇')) return `是一条名叫「${name.slice(2)}」的小蛇`;
  if (name.startsWith('魔法喵')) return `是一只名叫「${name.slice(3)}」的魔法猫`;
  if (name.startsWith('小鹰')) return `是一只名叫「${name.slice(2)}」的小鹰`;
  if (name.startsWith('小兔子')) return `是一只名叫「${name.slice(3)}」的小兔子`;
  if (/^小[\u4e00-\u9fff]{1,3}$/.test(name) && name.length <= 4)
    return `是故事中的小动物角色「${name}」`;
  if (name.endsWith('老师')) return `是${name}`;
  if (name.endsWith('王')) return `是故事中的反派/角色「${name}」`;
  if (name.endsWith('侦探')) return `是${name}`;
  if (name.endsWith('队长')) return `是${name}`;

  for (const text of texts) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m =
      text.match(new RegExp(`${esc}(?:是|为)(一[只条个位名][^，。！？]{2,25})`)) ||
      text.match(new RegExp(`(穿[^，。！？]{2,15}的)${esc}`)) ||
      text.match(new RegExp(`(一[只条个位名][^，。！？]{2,15})${esc}`));
    if (m) {
      const d = (m[1] || m[2] || '').trim();
      if (d.length >= 3) return `是${d.replace(/^是/, '')}`;
    }
  }
  return `是故事中的角色「${name}」`;
}

function main() {
  const files = walk(ARCHIVE);
  const whitelist = buildWhitelist(files);
  /** @type {Map<string, {desc:string, deeds:{story:string, deed:string}[], texts:string[]}>} */
  const chars = new Map();

  for (const f of files) {
    const { storyName, title, summary, body, content } = parseStory(f);
    const names = findCharactersInStory(content, whitelist);

    for (const name of names) {
      const aliases = Object.entries(ALIAS)
        .filter(([, v]) => v === name)
        .map(([k]) => k);

      const deed = extractDeedForChar(summary, body, name, title || storyName, aliases);

      if (!chars.has(name)) chars.set(name, { desc: '', deeds: [], texts: [] });
      const entry = chars.get(name);
      const storyKey = title || storyName;
      // 同一人物在同一故事中只保留一条
      if (!entry.deeds.some((d) => d.story === storyKey)) {
        entry.deeds.push({ story: storyKey, deed });
      }
      entry.texts.push(content);
    }
  }

  for (const [name, data] of chars) {
    data.desc = getDescription(name, data.texts);
  }

  const sorted = [...chars.entries()].sort((a, b) => b[1].deeds.length - a[1].deeds.length);

  const lines = [
    '# 故事人物与事迹汇总表',
    '',
    `> 共扫描 **${files.length}** 篇故事，整理 **${sorted.length}** 位出场人物**`,
    '',
    '| 人物 | 身份描述 | 事迹 |',
    '| --- | --- | --- |',
  ];

  for (const [name, { desc, deeds }] of sorted) {
    const deedStr = deeds.map((d) => `**${d.story}**：${d.deed}`).join('<br>');
    lines.push(`| ${name} | ${desc} | ${deedStr} |`);
  }

  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUT}: ${sorted.length} chars, ${files.length} stories`);
  console.log('Top 15:', sorted.slice(0, 15).map(([n, d]) => `${n}(${d.deeds.length})`).join(', '));
}

main();
