WidgetMetadata = {
  id: "ibox.cloud.live2",
  title: "iBox 播放资源",
  version: "1.6.1",
  requiredVersion: "0.0.1",
  description: "iBox 独立播放资源扩展，不替换现有内容模块",
  author: "ibox",
  site: "https://pan.baidu.com/",
  detailCacheDuration: 0,
  globalParams: [
    { name: "extraSourcesMode", title: "补充播放源", type: "enumeration", value: "on", description: "追加18个直连补充源（合计21个，覆盖国漫/国产剧/电影/韩剧/美剧/日漫/综艺）和已核验云盘条目；保留原有配置", enumOptions: [ { title: "开启（更多线路）", value: "on" }, { title: "关闭（只用原有源）", value: "off" } ] },
    { name: "playbackPreference", title: "播放偏好", type: "enumeration", value: "quality", description: "默认优先源文件标注的 4K/HDR，不转码、不删除其他画质", enumOptions: [ { title: "4K / 原画优先", value: "quality" }, { title: "流畅优先（小文件）", value: "smooth" } ] },
    { name: "directProviderUrls", title: "直连采集源", type: "input", description: "每行一个：名称|MacCMS API 地址；留空则用内置 21 个已实测源", value: "播剧网|https://ysxq.cc/api.php/provide/vod/\niBox采集A|http://149.104.6.155:12121/api.php/provide/vod/\niBox采集B|http://38.76.166.26:7788/api.php/provide/vod/" },
    { name: "baiduCookie", title: "百度 Cookie / Token", type: "input", description: "包含 BDUSS 和 STOKEN 的百度网盘 Cookie" },
    { name: "providerUrls", title: "云盘资源站", type: "input", description: "每行一个：名称|MacCMS站点地址", value: "小虎|http://103.40.14.172:12512" },
    { name: "embyServers", title: "私人媒体服务器", type: "input", description: "每行一个：名称|https://服务器地址|API令牌（公开服务器可留空令牌）" },
  ],
  modules: [
    { id: "loadResource", title: "iBox 播放资源", functionName: "loadResource", type: "stream", cacheDuration: 0, params: [] },
    {
      id: "loadList",
      title: "私人片库",
      functionName: "loadPrivateLibrary",
      params: [
        { name: "page", title: "页码", type: "page" },
        { name: "count", title: "数量", type: "count", value: "30" },
      ],
    },
    {
      id: "loadBrowse",
      title: "分类浏览",
      functionName: "loadBrowse",
      params: [
        {
          name: "category",
          title: "分类",
          type: "enumeration",
          value: "guoman",
          description: "按内容类型浏览全部采集源的片库",
          enumOptions: [
            { title: "国漫", value: "guoman" },
            { title: "国产剧", value: "guoju" },
            { title: "电影", value: "movie" },
            { title: "韩剧", value: "hanju" },
            { title: "美剧", value: "meiju" },
            { title: "日漫", value: "riman" },
            { title: "港剧", value: "gangju" },
            { title: "台剧", value: "taiju" },
            { title: "日剧", value: "riju" },
            { title: "泰剧", value: "taiju2" },
            { title: "综艺", value: "zongyi" },
            { title: "短剧", value: "duanju" },
          ],
        },
        { name: "page", title: "页码", type: "page" },
        { name: "count", title: "数量", type: "count", value: "30" },
      ],
    },
  ],
};


var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
var DLNA_UA = "netdisk;P2SP;2.2.91.136;android-android;";
var DEV_UID = "73CED981D0F186D12BC18CAE1684FFD5|VSRCQTF6W";
var CHANNEL = "android_12_zhao_bd-netdisk_1024266h";
var BAIDU_VERSION = "11.30.2";
var SALT_A = "ebrcUYiuxaZv2XGu7KIYKxUrqfnOfpDF";
var SALT_B = DEV_UID + BAIDU_VERSION + "ae5821440fab5e1a61a025f014bd8972";
var CACHE_NAMESPACE = "local.ibox.cloud.v1";
var VIDEO_PATTERN = /\.(mp4|mkv|avi|mov|m4v|webm|ts|flv|rmvb|wmv|m3u8)$/i;

async function searchBaiduCloud(params) {
  params = params || {};
  var keyword = String(params.keyword || params.query || "").trim();
  if (!keyword) return await listCloud(params);

  rememberBaiduCookie(params.baiduCookie);
  var providers = parseProviders(params.providerUrls);
  var results = [];

  for (var i = 0; i < providers.length; i += 1) {
    var provider = providers[i];
    try {
      var searchUrl =
        provider.baseUrl +
        "/index.php/vod/search.html?wd=" +
        encodeURIComponent(keyword);
      var html = await httpText(searchUrl, provider.baseUrl + "/");
      var items = parseSearchPage(html, provider);
      console.log("[iBox150] cloud search "+JSON.stringify({provider:provider.name,count:items.length}));
      results = results.concat(items);
    } catch (error) {
      console.error("云盘站点搜索失败:", provider.name, error.message || error);
    }
  }

  return results.slice(0, 60);
}

async function loadDetail(link) {
  var privateParsed = parsePrivateLink(link);
  if (privateParsed) {
    try { return await loadPrivateDetail(link); }
    catch (error) { console.error("[iBox152] private detail failed " + safeError(error)); return null; }
  }
  var context = decodeCloudLink(link);
  if (context && context.kind === "maccms") return await loadMacDetail(context);
  if (!context || (!context.url && !context.catalogEntry)) throw new Error("详情链接无效");

  var html = context.catalogEntry ? "" : await httpText(context.url, context.providerUrl || context.url);
  var detail = context.catalogEntry ? {title:context.title,poster:context.poster||"",description:"独立补充云盘条目"} : parseDetailPage(html, context.url);
  var shares = context.catalogEntry ? extractBaiduShares(JSON.stringify(context.shares||[])) : extractBaiduShares(html);
  if (!shares.length) {
    throw new Error("该资源页没有找到百度网盘分享");
  }

  var cookie = loadBaiduCookie();
  if (!cookie) {
    throw new Error("请先在模块设置中填写包含 BDUSS 的百度 Cookie");
  }

  var sessions = [];
  var failures = [];
  for (var i = 0; i < shares.length; i += 1) {
    try {
      var session = await prepareBaiduShare(
        shares[i].url,
        shares[i].pwd,
        cookie,
      );
      var copy={};for(var field in session)copy[field]=session[field];
      copy.lineName = (context.catalogEntry ? "百度极速·补充" : "百度极速") + (i + 1);
      sessions.push(copy);
    } catch (error) {
      failures.push("线路" + (i + 1) + ": " + safeError(error));
    }
  }
  if (!sessions.length) throw new Error("[iBox 1.5.1] " + failures.join("；"));

  var episodes = buildEpisodeItems(context, sessions);
  if (!episodes.length) throw new Error("百度分享中没有可用视频");

  return {
    id: context.id,
    type: "url",
    title: detail.title || context.title || "",
    description: detail.description || "",
    posterPath: detail.poster || context.poster || "",
    coverUrl: detail.poster || context.poster || "",
    backdropPath: detail.backdrop || detail.poster || context.poster || "",
    mediaType: "tv",
    link: link,
    episodeItems: episodes,
  };
}

async function forwardMediaIdentity(params) {
  params=params||{};
  var type=String(params.type||params.mediaType||"").toLowerCase();
  if(type==="series")type="tv";
  var raw=String(params.tmdbId||params.id||"");
  var typed=/^(movie|tv)[.:/](\d+)$/.exec(raw);
  if(typed){type=typed[1];raw=typed[2];}
  if(type!=="movie" && type!=="tv")type=params.season||params.episode?"tv":"movie";
  var result={type:type,season:Number(params.season||1),episode:Number(params.episode||1),
    title:String(params.seriesName||params.title||params.name||params.mediaName||""),
    tmdbId:/^\d+$/.test(raw)?raw:"",aliases:[],originalTitle:String(params.originalTitle||""),year:String(params.year||params.releaseDate||"").slice(0,4)};
  if(Widget.tmdb && typeof Widget.tmdb.get==="function"){
    try {
      var data=null;
      if(/^\d+$/.test(raw)){
        var key="official-identity:"+type+":"+raw;data=cacheGet(key);
        if(!data){data=await Widget.tmdb.get(type+"/"+raw,{params:{language:"zh-CN"}});if(data)cacheSet(key,data,1800);}
      }else{
        var imdb=String(params.imdbId||(/^tt\d+$/.test(raw)?raw:""));
        if(/^tt\d+$/.test(imdb)){
          var found=await Widget.tmdb.get("find/"+imdb,{params:{external_source:"imdb_id",language:"zh-CN"}});
          var list=type==="tv"?found.tv_results:found.movie_results;
          if(Array.isArray(list)&&list.length===1)data=list[0];
        }
      }
      if(data){
        if(data.id)result.tmdbId=String(data.id);
        result.title=String(data.title||data.name||result.title);
        result.originalTitle=String(data.original_title||data.original_name||result.originalTitle);
        result.year=String(data.release_date||data.first_air_date||result.year).slice(0,4);
      }
    }catch(error){}
  }
  if(!result.title)throw new Error("官方详情页未传入片名，且 TMDB 身份查询未成功；请打开影片详情后重试");
  return result;
}

function cleanTitleText(value) {
  return String(value||"").replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g,"").replace(/[０-９]/g,function(c){return String(c.charCodeAt(0)-65296);});
}
function officialIdentityTitles(identity) {
  var seen={},out=[];
  [identity.title,identity.originalTitle].concat(identity.aliases||[]).forEach(function(v){var text=cleanTitleText(v).trim(),key=resourceTitleKey(text);if(text&&!seen[key]&&out.length<8){seen[key]=true;out.push(text);}});
  return out;
}
async function loadVerifiedTitleAliases(identity) {
  if(!Widget.tmdb || typeof Widget.tmdb.get!=="function" || !/^\d+$/.test(String(identity.tmdbId||"")))return [];
  var key="verified-title-alias-v1:"+identity.type+":"+identity.tmdbId,cached=cacheGet(key);
  if(Array.isArray(cached))return cached;
  try {
    var data=await Widget.tmdb.get(identity.type+"/"+identity.tmdbId+"/alternative_titles",{params:{}});
    var entries=data&&(data.titles||data.results)||[],aliases=[],seen={};
    entries.forEach(function(entry){var text=cleanTitleText(entry.title||entry.name||"").trim(),country=String(entry.iso_3166_1||"").toUpperCase(),k=resourceTitleKey(text);if(/^(CN|TW|HK|SG)$/.test(country)&&text&&!seen[k]&&aliases.length<6){seen[k]=true;aliases.push(text);}});
    cacheSet(key,aliases,86400);return aliases;
  }catch(error){return [];}
}
function resourceTitleKey(value) {
  var title=cleanTitleText(value);
  function isQualityEdition(text){
    var rest=String(text).replace(/(?:4k|2160p|1080p|720p|hdr10\+?|hdr|sdr|uhd|dovi|dolby\s*vision|杜比视界|杜比|臻彩|原盘|蓝光|高清|超清|重制|修复|高码率|高码|原画|版本|版|全集|\d{2,3}\s*(?:fps|帧)|h[ ._-]?26[45]|hevc|\d{1,2}bit)/gi,"").replace(/[\s\u3000·•+_.\/-]/g,"");
    return !rest;
  }
  title=title.replace(/[（(]([^（）()]*)[）)]/g,function(all,inner){return inner&&isQualityEdition(inner)?"":all;});
  // Strip only an explicit trailing technical edition; never strip sequel numbers or unknown subtitles.
  title=title.replace(/(?:[ \t·_-]+)((?:4k|2160p|1080p|720p|uhd|hdr)[^（）()]*)$/i,function(all,inner){return isQualityEdition(inner)?"":all;});
  return title.replace(/[\s\u3000·•]/g,"").toLowerCase();
}

function explicitSeason(value) {
  var text=cleanTitleText(value),match=text.match(/第\s*([零〇一二三四五六七八九十百两\d]+)\s*季|season\s*(\d+)|\bS\s*(\d{1,2})\b/i);
  if(!match)return 0;var raw=match[1]||match[2]||match[3];if(/^\d+$/.test(raw))return Number(raw);
  var digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},sum=0,current=0;
  for(var i=0;i<raw.length;i++){var c=raw.charAt(i);if(c==="十"||c==="百"){sum+=(current||1)*(c==="十"?10:100);current=0;}else if(digits[c]!==undefined)current=digits[c];else return 0;}
  return sum+current;
}

function stripSeriesSeason(value) {
  var title=cleanTitleText(value);
  title=title.replace(/[（(\[]\s*(?:第\s*[零〇一二三四五六七八九十百两\d]+\s*季|season\s*\d+|S\s*\d{1,2})\s*[）)\]]/ig,"");
  return title.replace(/第\s*[零〇一二三四五六七八九十百两\d]+\s*季|season\s*\d+|\bS\s*\d{1,2}\b/ig,"").trim();
}
function officialSeriesSeason(identity) {
  return explicitSeason(identity.title)||Number(identity.season||1);
}
function sourceSeriesSeason(title,identity) {
  var marked=explicitSeason(title);if(marked)return marked;
  var target=officialSeriesSeason(identity),key=resourceTitleKey(title);
  var bases=officialIdentityTitles(identity).map(function(t){return resourceTitleKey(stripSeriesSeason(t));});
  if(target>=2 && bases.some(function(base){return key===base+target;}))return target;
  // Verified WeTV identity: animated series season 5 is the 2022 annual edition.
  // This is deliberately not a generic annual-edition or dynamic-comic substitution.
  if(target===5 && bases.indexOf("斗破苍穹")>=0 && key==="斗破苍穹年番")return 5;
  return 0;
}
function matchingOfficialItem(item,identity) {
  var context=decodeCloudLink(item.link);if(!context)return false;
  var title=String(context.title||item.title||""),target=officialSeriesSeason(identity);
  if(context.catalogEntry){
    if(context.mediaType!==identity.type)return false;
    if(identity.type==="tv" && (!Array.isArray(context.seasons)||context.seasons.indexOf(target)<0))return false;
    if(identity.type==="movie" && identity.year && context.year && identity.year!==String(context.year).slice(0,4))return false;
  }
  var season=identity.type==="tv"?sourceSeriesSeason(title,identity):explicitSeason(title);
  if(identity.type==="tv" && season && season!==target)return false;
  var titles=officialIdentityTitles(identity);
  var equal=titles.some(function(t){
    var sourceKey=resourceTitleKey(stripSeriesSeason(title)),officialKey=resourceTitleKey(stripSeriesSeason(t));
    if(sourceKey===officialKey)return true;
    if(identity.type!=="tv")return false;
    if(season===target && target>=2 && sourceKey===officialKey+target)return true;
    return target===5 && officialKey==="斗破苍穹" && sourceKey==="斗破苍穹年番";
  });
  if(!equal)return false;
  if(identity.type==="movie" && context.kind==="maccms" && identity.year && context.year && identity.year!==String(context.year).slice(0,4))return false;
  if(context.kind==="maccms" && item.mediaType && item.mediaType!==identity.type){
    var onePartAnime=identity.type==="movie" && item.mediaType==="tv" && context.animationOnePart && identity.year && String(context.year).slice(0,4)===identity.year;
    if(!onePartAnime)return false;
  }
  return true;
}

async function resourcesForOfficialItem(item,identity,params) {
  var context=decodeCloudLink(item.link);
  if(!context)return [];
  if(!context.kind && !normalizeBaiduCookie(params.baiduCookie||loadBaiduCookie()))throw new Error("百度原画需要在 iBox 设置中配置有效 Cookie");
  var detail=await loadDetail(item.link);var episodes=detail.episodeItems||[];var selected=null;
  var targetSeason=officialSeriesSeason(identity);
  if(identity.type==="movie")selected=episodes[0];
  else {
    for(var i=0;i<episodes.length;i++){
      if(episodes[i].episode===identity.episode && episodes[i].season===targetSeason){selected=episodes[i];break;}
    }
    // Some MacCMS entries store one explicit season as a standalone season-1 list.
    if(!selected && sourceSeriesSeason(context.title,identity)===targetSeason){
      for(var j=0;j<episodes.length;j++)if(episodes[j].episode===identity.episode){selected=episodes[j];break;}
    }
  }
  if(!selected)return [];
  var options={};for(var key in params)options[key]=params[key];
  options.link=selected.link;options._skipCrossSource=true;
  return await loadIBoxContextResources(options);
}

async function loadResource(params) {
  params=params||{};
  var cookie=rememberBaiduCookie(params.baiduCookie),legacy=decodeCloudLink(params.link);
  rememberEmbySetting(params.embyServers);
  if(parsePrivateLink(params.link)){
    console.log("[iBox152] private link playback");
    try{return await resourcesForPrivateLink(params);}
    catch(error){console.error("[iBox152] private playback failed "+safeError(error));throw error;}
  }
  console.log("[iBox150] start "+JSON.stringify({cookiePresent:!!cookie,contextKind:legacy?legacy.kind||"cloud":"official",season:Number(params.season||1),episode:Number(params.episode||1)}));
  try {
    var result=await loadResourceInternal(params);
    console.log("[iBox150] result "+JSON.stringify({count:result.length,names:result.map(function(r){return r.name;})}));
    return result;
  }catch(error){console.error("[iBox150] failed "+safeError(error));throw error;}
}

async function loadResourceInternal(params) {
  params=params||{};
  var legacy=decodeCloudLink(params.link);
  // A cached MacCMS episode link must not pin official playback to one HLS provider.
  if(legacy && /^(maccms|maccmsEpisode)$/.test(legacy.kind||"") && legacy.title){
    var expanded={};for(var field in params)expanded[field]=params[field];
    expanded.link="";expanded.title=legacy.title;expanded.seriesName=legacy.title;
    expanded.type=legacy.mediaType||params.type||params.mediaType||"tv";
    expanded.season=Number(legacy.season||params.season||1);expanded.episode=Number(legacy.episode||params.episode||1);
    if(!expanded.tmdbId)delete expanded.id;
    console.log("[iBox150] expand cached provider link "+JSON.stringify({title:legacy.title,season:expanded.season,episode:expanded.episode}));
    try{return await loadResourceInternal(expanded);}
    catch(error){console.error("[iBox150] expanded source lookup failed "+safeError(error));}
  }
  if(legacy&&(legacy.kind||legacy.files||legacy.url))return rankPlaybackResources(await loadIBoxContextResources(params),params.playbackPreference);
  var identity=await forwardMediaIdentity(params);
  var privateResources=[];
  try{privateResources=await resolveEmbyResources(params,identity);}
  catch(error){console.error("[iBox152] private media failed "+safeError(error));}
  var query={};for(var key in params)query[key]=params[key];query.keyword=identity.type==="tv"?stripSeriesSeason(identity.title):identity.title;
  var found=await searchCloud(query);
  var matches=found.filter(function(item){return matchingOfficialItem(item,identity);});
  if(!matches.length && identity.originalTitle && identity.originalTitle!==identity.title){
    query.keyword=identity.originalTitle;
    matches=(await searchCloud(query)).filter(function(item){return matchingOfficialItem(item,identity);});
  }
  if(!matches.length){
    if(privateResources.length){
      console.log("[iBox152] private only "+JSON.stringify({title:identity.title,count:privateResources.length}));
      return rankPlaybackResources(privateResources,params.playbackPreference);
    }
    identity.aliases=await loadVerifiedTitleAliases(identity);
    // First recheck already fetched results; a verified alias may avoid another source request.
    matches=found.filter(function(item){return matchingOfficialItem(item,identity);});
    var retryTitles=officialIdentityTitles(identity).filter(function(t){return resourceTitleKey(t)!==resourceTitleKey(identity.title)&&resourceTitleKey(t)!==resourceTitleKey(identity.originalTitle);}).slice(0,3);
    for(var aliasIndex=0;!matches.length && aliasIndex<retryTitles.length;aliasIndex++){
      query.keyword=identity.type==="tv"?stripSeriesSeason(retryTitles[aliasIndex]):retryTitles[aliasIndex];
      matches=(await searchCloud(query)).filter(function(item){return matchingOfficialItem(item,identity);});
    }
  }
  if(!matches.length)throw new Error("iBox 未匹配到 "+identity.title+(identity.type==="tv"?" S"+identity.season+"E"+identity.episode:identity.year?"（"+identity.year+"）":""));
  // Keep every exact-match source, including separate 4K editions. Limit concurrency, not quality.
  var uniqueMatches={},allMatches=[];
  matches.forEach(function(item){if(!uniqueMatches[item.id]){uniqueMatches[item.id]=true;allMatches.push(item);}});
  matches=allMatches;
  console.log("[iBox150] matches "+JSON.stringify({title:identity.title,season:identity.season,episode:identity.episode,total:matches.length,cloud:matches.filter(function(item){return !decodeCloudLink(item.link).kind;}).length}));
  var errors=[];
  var groups=await mapSourceJobs(matches,2,async function(item){
    try{
      var options={};for(var k in params)options[k]=params[k];options._directOnly=true;
      return await resourcesForOfficialItem(item,identity,options);
    }catch(error){var message=safeError(error);errors.push(message);console.error("[iBox150] source failed "+JSON.stringify({source:decodeCloudLink(item.link).kind||"baidu-cloud",error:message}));return [];}
  });
  var result=[],seen={};
  groups.forEach(function(group){group.forEach(function(resource){var key=playbackResourceKey(resource);if(!seen[key]){seen[key]=true;result.push(resource);}});});
  privateResources.forEach(function(resource){var key=playbackResourceKey(resource);if(!seen[key]){seen[key]=true;result.push(resource);}});
  // Web/platform parsing is a fallback, not a delay imposed on already playable sources.
  if(!result.length){
    var webItems=matches.filter(function(item){return !!decodeCloudLink(item.link).kind;});
    var webGroups=await Promise.all(webItems.map(async function(item){
      try{return await resourcesForOfficialItem(item,identity,params);}
      catch(error){errors.push(safeError(error));return [];}
    }));
    webGroups.forEach(function(group){group.forEach(function(resource){var key=playbackResourceKey(resource);if(!seen[key]){seen[key]=true;result.push(resource);}});});
  }
  result=rankPlaybackResources(result,params.playbackPreference);
  var displayNames={};result.forEach(function(resource){var base=resource.name;displayNames[base]=(displayNames[base]||0)+1;if(displayNames[base]>1)resource.name+=" · 候选"+displayNames[base];});
  if(!result.length)throw new Error("iBox 匹配到影片但未得到对应集的播放线路"+(errors.length?"；"+errors.slice(0,2).join("；"):""));
  return result;
}

async function mapSourceJobs(items,limit,worker) {
  var results=new Array(items.length),cursor=0;
  async function run(){
    while(cursor<items.length){var index=cursor++;results[index]=await worker(items[index],index);}
  }
  var jobs=[];for(var i=0;i<Math.min(limit,items.length);i++)jobs.push(run());
  await Promise.all(jobs);return results;
}

function playbackResourceKey(resource) {
  var url=String(resource.url||"");
  if(/^https?:\/\/d\.pcs\.baidu\.com\/file\//i.test(url)){
    var fid=/[?&]fid=([^&#]+)/.exec(url);if(fid)return "baidu-file:"+fid[1];
  }
  return url;
}

var MEDIA_PROBE_OBSERVATIONS={};
function rankPlaybackResources(resources,preference) {
  var smooth=preference==="smooth";
  function size(resource){var match=String(resource.name||"").match(/([0-9.]+)GB/);return match?Number(match[1]):Infinity;}
  function quality(resource){
    var name=String(resource.name||"");
    if(/(?:4k|2160p|uhd)/i.test(name))return /HDR|杜比视界|Dolby.?Vision/i.test(name)?61:60;
    if(/1440p/i.test(name))return 50;
    if(/1080p/i.test(name))return 40;
    if(/720p/i.test(name))return 30;
    if(/480p/i.test(name))return 20;
    if(/360p/i.test(name))return 10;
    return 0; // Never infer resolution from file size or container type.
  }
  function smoothRank(resource){
    if(/^百度极速/.test(resource.name)&&size(resource)<=2)return 0;
    if(/\.m3u8(?:$|[?#])/i.test(resource.url))return 1;
    if(/^百度极速/.test(resource.name))return 2;
    return 3;
  }
  return resources.map(function(resource,index){return {resource:resource,index:index};}).sort(function(a,b){
    var ap=/公开试看/.test(a.resource.name)?1:0,bp=/公开试看/.test(b.resource.name)?1:0;
    if(ap!==bp)return ap-bp;
    if(smooth){var rank=smoothRank(a.resource)-smoothRank(b.resource);if(rank)return rank;}
    else {
      var resolution=quality(b.resource)-quality(a.resource);if(resolution)return resolution;
      var ap=MEDIA_PROBE_OBSERVATIONS[a.resource.url],bp=MEDIA_PROBE_OBSERVATIONS[b.resource.url];
      if(quality(a.resource)>0 && ap && bp && Date.now()-ap.at<60000 && Date.now()-bp.at<60000 && ap.ms!==bp.ms)return ap.ms-bp.ms;
    }
    // Keep all files; use size only after the explicitly marked quality tier is the same.
    var left=size(a.resource),right=size(b.resource);if(left!==right)return left-right;
    return a.index-b.index;
  }).map(function(item){return item.resource;});
}

async function loadIBoxContextResources(params) {
  params = params || {};
  var context = decodeCloudLink(params.link);
  if (context && (context.kind === "maccms" || context.kind === "maccmsEpisode")) return await loadMacResources(context, params);
  var files = context && context.files;
  if (!files || !files.length) return [];

  var cookie = rememberBaiduCookie(params.baiduCookie) || loadBaiduCookie();
  if (!cookie) {
    throw new Error("百度 Cookie 未配置");
  }

  var uid = await getBaiduUid(cookie);
  var resources = [];
  var nameCounts = {};
  var resourceSizes = [];
  var failures = [];
  // Bound file work per call; merge in input order so completion timing cannot rename candidates.
  var fileResults = await mapSourceJobs(files, 2, async function (file) {
    try {
      var directUrl = normalizeBaiduDownloadUrl(await resolveBaiduDirect(file, cookie, uid));
      return { url: directUrl, container: await inspectBaiduContainer(file, directUrl) };
    } catch (error) {
      return { error: safeError(error) };
    }
  });
  for (var i = 0; i < files.length; i += 1) {
    try {
      if (fileResults[i].error !== undefined) {
        failures.push(fileResults[i].error);
        continue;
      }
      var directUrl = fileResults[i].url;
      files[i].container = fileResults[i].container;
      var resourceName = describeResource(files[i]);
      nameCounts[resourceName] = Number(nameCounts[resourceName] || 0) + 1;
      if (nameCounts[resourceName] > 1) {
        resourceName += " " + nameCounts[resourceName];
      }
      resourceSizes.push(Number(files[i].size || 0));
      resources.push({
        name: resourceName,
        description: "百度网盘 · DLNA" + (files[i].size ? " · " + formatFileSize(files[i].size) : "") +
          (MEDIA_PROBE_OBSERVATIONS[directUrl] ? " · 32KB试读 " + MEDIA_PROBE_OBSERVATIONS[directUrl].ms + "ms" : ""),
        url: directUrl,
        customHeaders: {
          "User-Agent": DLNA_UA,
          Referer: "https://pan.baidu.com/",
          "Accept-Encoding": "identity",
        },
        playerType: baiduPlayerForFile(files[i]),
      });
    } catch (error) {
      failures.push(safeError(error));
    }
  }
  if (!resources.length && failures.length) throw new Error("[iBox 1.5.1 播放] " + failures.join("；"));
  return resources.map(function (resource, index) {
    return { resource: resource, size: resourceSizes[index] || Infinity, order: index };
  }).sort(function (a, b) { return a.size === b.size ? a.order - b.order : a.size - b.size; })
    .map(function (entry) { return entry.resource; });
}

function identifyMediaContainer(value) {
  if(value===null||value===undefined)return "";
  var bytes=null;
  if(typeof ArrayBuffer!=="undefined" && value instanceof ArrayBuffer)bytes=new Uint8Array(value);
  else if(typeof ArrayBuffer!=="undefined" && ArrayBuffer.isView && ArrayBuffer.isView(value))bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  else if(Array.isArray(value))bytes=value;
  if(bytes){
    if(bytes.length>=4 && bytes[0]===26 && bytes[1]===69 && bytes[2]===223 && bytes[3]===163)return "mkv";
    if(bytes.length>=8 && bytes[4]===102 && bytes[5]===116 && bytes[6]===121 && bytes[7]===112)return "mp4";
    return "";
  }
  var text=String(value).slice(0,256);
  // URLSession bridges may decode the binary body as text; the ASCII EBML DocType survives.
  if(text.indexOf("matroska")>=0 || text.indexOf("webm")>=0 || /^GkXf/i.test(text))return "mkv";
  var ftyp=text.indexOf("ftyp");if(ftyp>=4&&ftyp<=12)return "mp4";
  return "";
}

async function inspectBaiduContainer(file,url) {
  var key="container-v1:"+parseBaiduShortId(file.shareUrl)+":"+file.fsId+":"+file.size;
  var cached=cacheGet(key);
  if(cached!=="mkv" && cached!=="mp4")cached="";
  if(cached)return cached;
  var began=Date.now();
  try {
    var response=await Widget.http.get(url,{headers:{"User-Agent":DLNA_UA,Referer:"https://pan.baidu.com/","Accept-Encoding":"identity",Range:"bytes=0-32767"},timeout:5000});
    var status=Number(response.statusCode||response.status||0);
    if(status!==206)return cached||"";
    MEDIA_PROBE_OBSERVATIONS[url]={ms:Math.max(1,Date.now()-began),at:Date.now()};
    var kind=identifyMediaContainer(response.data);
    if(kind)cacheSet(key,kind,86400);
    return kind||cached||"";
  }catch(error){return cached||"";}
}

function baiduPlayerForFile(file) {
  if(file.container==="mkv")return "app";
  if(file.container==="mp4")return "system";
  // Unknown high-quality files stay on the container-capable player instead of trusting a suffix.
  if(/4K|2160P|HDR|杜比/i.test(String(file.name||"")))return "app";
  return /\.(mp4|m4v|mov)$/i.test(file.name)?"system":"app";
}

function normalizeBaiduDownloadUrl(url) {
  var text = String(url);
  if (!/^https?:\/\/d\.pcs\.baidu\.com\/file\//i.test(text)) return text;
  // Forward percent-encodes the playback URL once after the widget returns it.
  // Supply the Base64 signature, not its pre-escaped form, to avoid %3D -> %253D.
  // Baidu accepts the raw Base64 +/= characters; leave other query fields unchanged.
  return text.replace(/([?&]sign=)([^&]*)/i, function (_, key, value) {
    for (var i = 0; i < 3 && /%[0-9a-f]{2}/i.test(value); i++) {
      try { value = decodeURIComponent(value); } catch (error) { break; }
    }
    return key + value;
  });
}

function buildEpisodeItems(context, sessions) {
  var entries = [];
  var hasEpisodes = false;
  for (var line = 0; line < sessions.length; line += 1) {
    for (var index = 0; index < sessions[line].files.length; index += 1) {
      var file = sessions[line].files[index];
      var episodeInfo = parseEpisodeInfo(file.name);
      if (episodeInfo) hasEpisodes = true;
      entries.push({
        session: sessions[line],
        file: file,
        episodeInfo: episodeInfo,
      });
    }
  }

  var groups = [];
  var groupByKey = {};
  for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    var entry = entries[entryIndex];
    var info = entry.episodeInfo;
    if (hasEpisodes && !info) continue;
    var key = info
      ? "episode:" + info.season + ":" + info.episode
      : "file:" + entry.session.shortId + ":" + entry.file.path;
    var group = groupByKey[key];
    if (!group) {
      group = {
        key: key,
        episodeInfo: info,
        files: [],
      };
      groupByKey[key] = group;
      groups.push(group);
    }
    group.files.push({
      lineName: entry.session.lineName,
      shareUrl: entry.session.shareUrl,
      pwd: entry.session.pwd,
      fsId: entry.file.id,
      size: entry.file.size,
      path: entry.file.path,
      name: entry.file.name,
    });
  }

  groups.sort(function (left, right) {
    var leftInfo = left.episodeInfo;
    var rightInfo = right.episodeInfo;
    if (leftInfo && rightInfo) {
      if (leftInfo.season !== rightInfo.season) {
        return leftInfo.season - rightInfo.season;
      }
      return leftInfo.episode - rightInfo.episode;
    }
    if (leftInfo) return -1;
    if (rightInfo) return 1;
    return naturalCompare(left.files[0].name, right.files[0].name);
  });

  var episodes = [];
  for (var groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    var current = groups[groupIndex];
    var episodeTitle = current.episodeInfo
      ? "S" +
        padNumber(current.episodeInfo.season, 2) +
        "E" +
        padNumber(current.episodeInfo.episode, 2)
      : current.files[0].name;
    var season = current.episodeInfo ? current.episodeInfo.season : 1;
    var episode = current.episodeInfo
      ? current.episodeInfo.episode
      : groupIndex + 1;
    episodes.push({
      id: context.id + "#S" + season + "E" + episode,
      type: "url",
      title: episodeTitle,
      mediaType: "tv",
      posterPath: context.poster || "",
      season: season,
      episode: episode,
      link: encodeCloudLink({
        files: current.files,
        providerUrl: context.providerUrl,
      }),
    });
  }
  return episodes;
}

function parseEpisodeInfo(name) {
  var text = String(name || "");
  var match = text.match(
    /(?:^|[^A-Za-z])S(\d{1,2})[ ._-]?E(\d{1,4})(?:[^0-9]|$)/i,
  );
  if (!match) {
    match = text.match(/第\s*(\d{1,4})\s*[集话話]/i);
    if (match) {
      return { season: 1, episode: Number(match[1]) };
    }
  }
  if (!match) {
    match = text.match(/(?:^|[^A-Za-z])E(\d{1,4})(?:[^0-9]|$)/i);
    if (match) {
      return { season: 1, episode: Number(match[1]) };
    }
  }
  if (!match) {
    match = text.match(/^\s*(\d{1,3})(?:[ ._-]|$)/);
    if (match) {
      return { season: 1, episode: Number(match[1]) };
    }
  }
  if (!match) return null;
  return {
    season: Number(match[1]),
    episode: Number(match[2]),
  };
}

function padNumber(value, size) {
  var text = String(value);
  while (text.length < size) text = "0" + text;
  return text;
}

function describeResource(file) {
  var quality = firstMatch(
    file.name,
    /(4K\s*HDR|4K|2160P|1440P|1080P|720P|HDR|杜比视界)/i,
  );
  var name = file.lineName || "百度网盘";
  if (quality) name += " · " + quality.toUpperCase().replace(/\s+/g, " ");
  if (file.size) name += " · " + formatFileSize(file.size);
  var extension=String(file.name||"").match(/\.([A-Za-z0-9]+)$/);
  if(file.container)name+=" · "+file.container.toUpperCase();
  else if(extension)name+=" · 后缀"+extension[1].toUpperCase();
  return name;
}

function formatFileSize(size) {
  return (Number(size) / 1000000000).toFixed(2) + "GB";
}

function parseProviders(value) {
  var text = String(value || "").trim() || "小虎|http://103.40.14.172:12512";
  var lines = text.split(/\r?\n/);
  var result = [];
  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i].trim();
    if (!line) continue;
    var separator = line.indexOf("|");
    var name = separator >= 0 ? line.slice(0, separator).trim() : "云盘";
    var baseUrl = separator >= 0 ? line.slice(separator + 1).trim() : line;
    baseUrl = baseUrl.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(baseUrl)) continue;
    result.push({ name: name || "云盘", baseUrl: baseUrl });
  }
  return result;
}

function parseSearchPage(html, provider) {
  var text = String(html || "");
  var parts = text.split('class="module-search-item"');
  var items = [];
  for (var i = 1; i < parts.length; i += 1) {
    var block = parts[i];
    var hrefMatch = block.match(/href="(\/index\.php\/vod\/detail\/id\/[^"]+\.html)"/i);
    if (!hrefMatch) {
      hrefMatch = block.match(/href="(\/index\.php\/vod\/play\/id\/[^"]+\.html)"/i);
    }
    if (!hrefMatch) continue;

    var detailUrl = absoluteUrl(hrefMatch[1], provider.baseUrl);
    var titleMatch = block.match(/<h3>\s*<a[^>]*title="([^"]*)"/i);
    var statusMatch = block.match(/class="video-serial"[^>]*>([^<]*)</i);
    var posterMatch = block.match(/data-src="([^"]+)"/i);
    var title = decodeHtml(titleMatch ? titleMatch[1] : "");
    if (!title) continue;

    items.push({
      id: provider.name + ":" + hrefMatch[1],
      type: "url",
      title: provider.name + " | 云盘 · " + title,
      description: decodeHtml(statusMatch ? statusMatch[1] : ""),
      mediaType: "tv",
      posterPath: posterMatch ? normalizePosterUrl(absoluteUrl(decodeHtml(posterMatch[1]), provider.baseUrl)) : "",
      link: encodeCloudLink({
        id: provider.name + ":" + hrefMatch[1],
        title: title,
        poster: posterMatch ? normalizePosterUrl(absoluteUrl(decodeHtml(posterMatch[1]), provider.baseUrl)) : "",
        url: detailUrl,
        providerUrl: provider.baseUrl,
      }),
    });
  }
  return items;
}

function parseDetailPage(html, baseUrl) {
  var text = String(html || "");
  var titleMatch =
    text.match(
      /<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    ) || text.match(/<h3>\s*<a[^>]*title="([^"]*)"/i);
  var headTitle = text.match(/<title>([^<]*)<\/title>/i);
  var descriptionMatch = text.match(
    /class="[^"]*video-info-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  var title = decodeHtml(titleMatch ? titleMatch[1] : headTitle ? headTitle[1] : "");
  var poster = extractPoster(text, title, baseUrl);
  return {
    title: title,
    poster: poster,
    backdrop: poster,
    description: cleanText(descriptionMatch ? descriptionMatch[1] : ""),
  };
}

function extractPoster(html, title, baseUrl) {
  var text = String(html || "");
  var imagePattern = /<img\b[^>]*>/gi;
  var candidates = [];
  var match;
  while ((match = imagePattern.exec(text))) {
    var tag = match[0];
    var value =
      extractAttribute(tag, "data-src") ||
      extractAttribute(tag, "data-original") ||
      extractAttribute(tag, "src");
    if (!value) continue;

    var imageUrl = normalizePosterUrl(absoluteUrl(decodeHtml(value), baseUrl));
    var alt = decodeHtml(extractAttribute(tag, "alt"));
    var nearby = text.slice(Math.max(0, match.index - 1200), match.index);
    var score = 0;
    if (alt && title && alt === title) score += 220;
    else if (alt && title && alt.indexOf(title) >= 0) score += 140;
    if (/module-item-pic|video-cover|module-item-cover/i.test(nearby)) {
      score += 90;
    }
    if (/doubanio|douban|tmdb|poster|cover/i.test(imageUrl)) score += 45;
    if (/logo|loading|loliapi|\/acg\/|\.gif(?:$|\?)/i.test(imageUrl)) {
      score -= 260;
    }
    candidates.push({ url: imageUrl, score: score });
  }
  candidates.sort(function (left, right) {
    return right.score - left.score;
  });
  return candidates.length && candidates[0].score > 0
    ? candidates[0].url
    : "";
}

function extractAttribute(tag, name) {
  var pattern = new RegExp(
    "\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')",
    "i",
  );
  var match = String(tag || "").match(pattern);
  return match ? match[1] || match[2] || "" : "";
}

function extractBaiduShares(html) {
  var text = String(html || "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
  var matches = text.match(
    /https?:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_-]+(?:\?pwd=[A-Za-z0-9]+)?/gi,
  ) || [];
  var seen = {};
  var shares = [];
  for (var i = 0; i < matches.length; i += 1) {
    var url = matches[i];
    if (seen[url]) continue;
    seen[url] = true;
    var passwordMatch = url.match(/[?&]pwd=([A-Za-z0-9]+)/i);
    shares.push({
      url: url,
      pwd: passwordMatch ? passwordMatch[1] : "",
    });
  }
  return shares;
}

var BAIDU_SHARE_FLIGHTS={};
async function prepareBaiduShare(shareUrl,password,accountCookie) {
  var key=parseBaiduShortId(shareUrl)+":"+String(password||"");
  if(BAIDU_SHARE_FLIGHTS[key])return await BAIDU_SHARE_FLIGHTS[key];
  var pending=prepareBaiduShareInternal(shareUrl,password,accountCookie);
  BAIDU_SHARE_FLIGHTS[key]=pending;
  try{return await pending;}finally{if(BAIDU_SHARE_FLIGHTS[key]===pending)delete BAIDU_SHARE_FLIGHTS[key];}
}

async function prepareBaiduShareInternal(shareUrl, password, accountCookie) {
  var shortId = parseBaiduShortId(shareUrl);
  if (!shortId) throw new Error("百度分享链接无效");
  var cacheKey = "baidu-session:" + shortId + ":" + password;
  var cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Password-protected shares can be verified directly with the configured BAIDUID.
  // Avoid opening an unverified /s/ URL in URLSession's automatic redirect handler.
  // Public share pages need their own BAIDUID/BDCLND session, not the account's SSO cookies.
  // Sending an unrelated account STOKEN here can create a pan <-> passport redirect loop.
  var baiduid = getCookie(accountCookie, "BAIDUID");
  var shareCookie = baiduid ? "BAIDUID=" + baiduid : "";
  if (!password || !baiduid) {
    var initial = await httpGet("https://pan.baidu.com/s/" + shortId,
      "https://pan.baidu.com/", shareCookie);
    shareCookie = initial.cookie || shareCookie;
  }

  var randsk = "";
  if (password) {
    var verifyUrl =
      "https://pan.baidu.com/share/verify?surl=" +
      encodeURIComponent(shortId.slice(1)) +
      "&t=" +
      Date.now() +
      "&channel=chunlei&clienttype=0&web=1&app_id=250528";
    var verifyResponse = await Widget.http.post(
      verifyUrl,
      "pwd=" + encodeURIComponent(password),
      {
        allow_redirects: false,
        headers: {
          "User-Agent": USER_AGENT,
          Referer: "https://pan.baidu.com/s/" + shortId,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Cookie: shareCookie,
        },
      },
    );
    shareCookie = mergeResponseCookies(shareCookie, verifyResponse);
    var verifyData = asJson(verifyResponse.data);
    if (Number(verifyData.errno) !== 0 || !verifyData.randsk) {
      throw new Error("百度分享验证失败: " + String(verifyData.errno) + " " + safeError(verifyData.err_msg || verifyData.show_msg || ""));
    }
    randsk = verifyData.randsk;
  }

  if (randsk) shareCookie = setCookie(shareCookie, "BDCLND", randsk);
  var pageUrl =
    "https://pan.baidu.com/s/" +
    shortId +
    (password ? "?pwd=" + encodeURIComponent(password) : "");
  var page = await httpGet(pageUrl, "https://pan.baidu.com/", shareCookie);
  var html = page.text;
  var pageCookie = page.cookie || shareCookie;
  var localData = extractJsonCall(html, "locals.mset");
  var shareUk =
    (localData && localData.share_uk) ||
    firstMatch(html, /"share_uk"\s*:\s*"?(\d+)"?/i);
  var shareId =
    (localData && localData.shareid) ||
    firstMatch(html, /"shareid"\s*:\s*(\d+)/i);
  if (!shareUk || !shareId) {
    throw new Error("百度分享页未返回 shareid/share_uk");
  }

  var rootEntry =
    localData && Array.isArray(localData.file_list)
      ? localData.file_list[0]
      : null;
  var session = {
    shareUrl: shareUrl,
    shortId: shortId,
    pwd: password,
    shareUk: String(shareUk),
    shareId: String(shareId),
    pageCookie: pageCookie,
    rootPath: rootEntry && rootEntry.path ? rootEntry.path : "/",
    rootIsFile: Boolean(rootEntry && !rootEntry.isdir),
    rootEntry: rootEntry,
  };
  session.files = await collectBaiduFiles(session);
  cacheSet(cacheKey, session, 10 * 60);
  return session;
}

async function collectBaiduFiles(session) {
  if (session.rootIsFile) {
    var rootFile = normalizeFile(session.rootEntry || {});
    return VIDEO_PATTERN.test(rootFile.name) ? [rootFile] : [];
  }

  var queue = [{ path: session.rootPath, depth: 0 }];
  var visited = {};
  var files = [];
  while (queue.length && Object.keys(visited).length < 8) {
    var current = queue.shift();
    if (!current || visited[current.path] || current.depth > 3) continue;
    visited[current.path] = true;
    var entries = await listBaiduDirectory(session, current.path);
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      if (entry.isdir) {
        if (current.depth < 3 && entry.path) {
          queue.push({ path: entry.path, depth: current.depth + 1 });
        }
      } else {
        var file = normalizeFile(entry);
        if (VIDEO_PATTERN.test(file.name)) files.push(file);
      }
    }
  }
  files.sort(function (left, right) {
    return naturalCompare(left.name, right.name);
  });
  return files;
}

async function listBaiduDirectory(session, dirPath) {
  var params = {
    uk: session.shareUk,
    shareid: session.shareId,
    order: "other",
    desc: "1",
    showempty: "0",
    web: "1",
    page: "1",
    num: "100",
    t: String(Date.now()),
    channel: "chunlei",
    app_id: "250528",
    bdstoken: "",
    clienttype: "0",
  };
  if (dirPath && dirPath !== "/") {
    params.dir = dirPath;
  } else {
    params.root = "1";
  }
  var response = await Widget.http.get(
    buildUrl("https://pan.baidu.com/share/list", params),
    {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://pan.baidu.com/s/" + session.shortId,
        Cookie: session.pageCookie,
      },
    },
  );
  var data = asJson(response.data);
  if (Number(data.errno) !== 0) {
    throw new Error(
      "百度目录读取失败: " +
      String(data.show_msg || data.err_msg || data.errno),
    );
  }
  return Array.isArray(data.list) ? data.list : [];
}

async function resolveBaiduDirect(file, accountCookie, uid) {
  var session = await prepareBaiduShare(file.shareUrl, file.pwd, accountCookie);
  if (!file.size) {
    for (var f = 0; f < session.files.length; f++) {
      if (String(session.files[f].id) === String(file.fsId) || session.files[f].path === file.path) {
        file.size = session.files[f].size; break;
      }
    }
  }
  var bduss = getCookie(accountCookie, "BDUSS");
  var sekey = getCookie(session.pageCookie, "BDCLND");
  if (!bduss || !sekey) {
    throw new Error("百度 Cookie 缺少 BDUSS 或分享会话缺少 BDCLND");
  }

  var time = String(Date.now());
  var rand = sha1Hex(sha1Hex(bduss) + uid + SALT_A + time + SALT_B);
  var url = buildUrl("https://pan.baidu.com/share/list", {
    shareid: session.shareId,
    uk: session.shareUk,
    fid: file.fsId,
    sekey: decodeSekey(sekey),
    origin: "dlna",
    devuid: DEV_UID,
    clienttype: "1",
    channel: CHANNEL,
    version: BAIDU_VERSION,
    time: time,
    rand: rand,
  });
  var response = await Widget.http.get(url, {
    headers: {
      "User-Agent": DLNA_UA,
      Accept: "application/json, text/plain, */*",
      Referer: "https://pan.baidu.com/",
      Cookie: setCookie(accountCookie, "BDCLND", sekey),
    },
  });
  var data = asJson(response.data);
  var errno = Number(data.errno || data.error_code || 0);
  if (errno !== 0) {
    throw new Error(
      "百度 DLNA 失败: " +
      errno +
      " " +
      String(data.show_msg || data.err_msg || ""),
    );
  }
  var directUrl = findDirectUrl(data);
  if (!directUrl) throw new Error("百度 DLNA 未返回直链");
  return directUrl;
}

var BAIDU_UID_INFLIGHT = {};
async function getBaiduUid(accountCookie) {
  var key = "baidu-uid:" + sha1Hex(accountCookie).slice(0, 12);
  var cached = cacheGet(key);
  if (cached) return cached;
  var pending = BAIDU_UID_INFLIGHT[key];
  if (!pending) {
    pending = (async function () {
      var response = await Widget.http.get(
        "https://mbd.baidu.com/userx/v1/info/get?appname=baiduboxapp" +
          "&fields=%5B%22uid%22%5D&client&clientfrom&lang=zh-cn&tpl&ttt",
        {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json, text/plain, */*",
            Cookie: accountCookie,
          },
        },
      );
      var uid = firstMatch(asText(response.data), /"uid"\s*:\s*"?(\d+)"?/i);
      if (!uid) throw new Error("无法从百度 Cookie 获取 uid");
      cacheSet(key, uid, 30 * 60);
      return uid;
    })();
    BAIDU_UID_INFLIGHT[key] = pending;
  }
  try {
    return await pending;
  } finally {
    if (BAIDU_UID_INFLIGHT[key] === pending) delete BAIDU_UID_INFLIGHT[key];
  }
}

function normalizeFile(entry) {
  return {
    id: String(entry.fs_id || ""),
    name: String(entry.server_filename || entry.filename || "未命名"),
    path: String(entry.path || ""),
    size: Number(entry.size || 0),
  };
}

function parseBaiduShortId(value) {
  var match = String(value || "").match(/\/s\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : "";
}

function rememberBaiduCookie(value) {
  var cookie = normalizeBaiduCookie(value);
  if (cookie) {
    Widget.storage.set("baiduCookie", cookie);
    return cookie;
  }
  return loadBaiduCookie();
}

function loadBaiduCookie() {
  return normalizeBaiduCookie(Widget.storage.get("baiduCookie") || "");
}

function normalizeBaiduCookie(value) {
  var text = String(value || "").trim();
  if (!text) return "";
  if (text.charAt(0) === "{") {
    try {
      var object = JSON.parse(text);
      var pairs = [];
      for (var key in object) {
        if (
          Object.prototype.hasOwnProperty.call(object, key) &&
          object[key] !== undefined &&
          object[key] !== null &&
          String(object[key])
        ) {
          pairs.push(key + "=" + String(object[key]));
        }
      }
      text = pairs.join("; ");
    } catch (error) {
      return "";
    }
  }
  if (/^BDUSS\s+/i.test(text)) {
    text = "BDUSS=" + text.replace(/^BDUSS\s+/i, "");
  }
  return /(?:^|;\s*)BDUSS\s*=/i.test(text) ? text : "";
}

function getCookie(cookie, name) {
  var items = String(cookie || "").split(";");
  for (var i = 0; i < items.length; i += 1) {
    var separator = items[i].indexOf("=");
    if (separator < 0) continue;
    if (items[i].slice(0, separator).trim() === name) {
      return items[i].slice(separator + 1).trim();
    }
  }
  return "";
}

function setCookie(cookie, name, value) {
  var items = String(cookie || "").split(";");
  var output = [];
  var replaced = false;
  for (var i = 0; i < items.length; i += 1) {
    var item = items[i].trim();
    if (!item) continue;
    var separator = item.indexOf("=");
    if (separator < 0) continue;
    var key = item.slice(0, separator).trim();
    if (key === name) {
      output.push(name + "=" + value);
      replaced = true;
    } else {
      output.push(item);
    }
  }
  if (!replaced) output.push(name + "=" + value);
  return output.join("; ");
}

function cacheGet(key) {
  if (!Widget.sharedCache || typeof Widget.sharedCache.get !== "function") {
    return null;
  }
  var value = Widget.sharedCache.get(CACHE_NAMESPACE, key);
  if (value === null || value === undefined) return null;
  var expiresAt = Number(Widget.storage.get("cache-time:" + key) || 0);
  if (expiresAt && expiresAt <= Date.now()) {
    if (typeof Widget.sharedCache.remove === "function") {
      Widget.sharedCache.remove(CACHE_NAMESPACE, key);
    }
    Widget.storage.remove("cache-time:" + key);
    return null;
  }
  return value;
}

function cacheSet(key, value, seconds) {
  if (!Widget.sharedCache || typeof Widget.sharedCache.set !== "function") {
    return;
  }
  Widget.sharedCache.set(CACHE_NAMESPACE, key, value);
  if (seconds) {
    Widget.storage.set("cache-time:" + key, Date.now() + seconds * 1000);
  }
}

async function httpText(url, referer, cookie) {
  var response = await httpGet(url, referer, cookie);
  return response.text;
}

async function httpGet(url, referer, cookie) {
  var currentUrl = String(url);
  var currentCookie = String(cookie || ""),siteCookieRetried=false;
  for (var hop = 0; hop < 7; hop += 1) {
    var headers = {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/json,text/plain,*/*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
      Referer: referer || currentUrl,
    };
    if (currentCookie) headers.Cookie = currentCookie;
    var response;
    try {response = await Widget.http.get(currentUrl, {headers: headers, allow_redirects: false});}
    catch(error){
      var failed=error&&error.response;
      if(failed && failed.data!==undefined && Number(failed.statusCode||failed.status)===403)response=failed;
      else throw error;
    }
    var previousCookie=currentCookie;
    currentCookie = mergeResponseCookies(currentCookie, response);
    var status = Number(response.statusCode || response.status || 200);
    var location = responseHeader(response, "location");
    // Some public indexes set a first-visit cookie and return a literal same-page JS reload.
    // Replay once, only with the index's new cookies. Never evaluate JS or retry Baidu SSO.
    if(status===403 && !siteCookieRetried && !cookie && currentCookie && currentCookie!==previousCookie && !/^https?:\/\/(?:[^/]+\.)?baidu\.com(?::\d+)?(?:\/|$)/i.test(currentUrl)){
      var body=asText(response.data),reload=body.length<8192 && body.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/);
      if(reload && resolveRedirectUrl(reload[1],currentUrl)===currentUrl){siteCookieRetried=true;continue;}
    }
    if (location && (status === 301 || status === 302 || status === 303 || status === 307 || status === 308)) {
      var nextUrl = resolveRedirectUrl(location, currentUrl);
      var oldHost = /^https?:\/\/([^/]+)/i.exec(currentUrl);
      var newHost = /^https?:\/\/([^/]+)/i.exec(nextUrl);
      // Baidu SSO uses passport.baidu.com; only the known Baidu service hosts may receive this cookie.
      var baiduHosts = /^(pan|passport|wappass)\.baidu\.com$/i;
      var sameBaiduService = oldHost && newHost && baiduHosts.test(oldHost[1]) && baiduHosts.test(newHost[1]);
      if (oldHost && newHost && oldHost[1].toLowerCase() !== newHost[1].toLowerCase() && !sameBaiduService) {
        throw new Error("分享页跳转至 " + newHost[1] + "，请在百度网盘确认分享可访问");
      }
      currentUrl = nextUrl;
      continue;
    }
    if (status >= 400) throw new Error("HTTP " + status);
    return {text: asText(response.data), cookie: currentCookie};
  }
  throw new Error("分享页在保留 Cookie 后仍超过 7 次跳转");
}

function responseHeader(response, name) {
  var headers = response && response.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  for (var key in headers) {
    if (String(key).toLowerCase() === name.toLowerCase()) {
      return String(Array.isArray(headers[key]) ? headers[key][0] : headers[key] || "");
    }
  }
  return "";
}

function resolveRedirectUrl(location, currentUrl) {
  var value = String(location || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  var origin = /^(https?:\/\/[^/]+)/i.exec(currentUrl);
  if (!origin) throw new Error("跳转地址无效");
  if (value.indexOf("//") === 0) return currentUrl.split(":")[0] + ":" + value;
  if (value.charAt(0) === "/") return origin[1] + value;
  if (value.charAt(0) === "?") return currentUrl.split("?")[0] + value;
  return currentUrl.split("?")[0].replace(/[^/]*$/, "") + value;
}

function mergeResponseCookies(cookie, response) {
  var merged = String(cookie || "");
  var headers = response && response.headers;
  if (!headers) return merged;
  var values = [];
  if (typeof headers.getSetCookie === "function") values = headers.getSetCookie() || [];
  if (!values.length) {
    var raw = "";
    if (typeof headers.get === "function") raw = headers.get("set-cookie") || "";
    else for (var key in headers) if (String(key).toLowerCase() === "set-cookie") raw = headers[key];
    values = Array.isArray(raw) ? raw : String(raw || "").split(/,(?=\s*[^;,=\s]+=)/);
  }
  for (var i = 0; i < values.length; i += 1) {
    var pair = String(values[i] || "").split(";")[0];
    var separator = pair.indexOf("=");
    if (separator > 0) merged = setCookie(merged, pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return merged;
}

function safeError(error) {
  return String(error && error.message ? error.message : error || "")
    .replace(/(?:BDUSS|STOKEN|BDCLND|BAIDUID)=[^;\s"']+/gi, "[credential redacted]")
    .replace(/https?:\/\/[^\s"']+/gi, "[URL]")
    .slice(0, 180);
}

async function listBaiduCloud(params) {
  params = params || {};
  rememberBaiduCookie(params.baiduCookie);
  var providers = parseProviders(params.providerUrls);
  var groups = await Promise.all(providers.map(async function (provider) {
    var html = await httpText(provider.baseUrl + "/", provider.baseUrl + "/");
    var pattern = /<a\b([^>]*href=["'](\/index\.php\/vod\/detail\/id\/[^"']+\.html)["'][^>]*)>([\s\S]*?)<\/a>/gi;
    var match, items = [], itemByPath = {}, posterByPath = {};
    while ((match = pattern.exec(html))) {
      var imageTag = (match[3].match(/<img\b[^>]*>/i) || [""])[0];
      if (!imageTag) {
        var cardStart = html.lastIndexOf('<div class="module-item">', match.index);
        if (cardStart >= 0) {
          var cardEnd = html.indexOf('<div class="module-item">', cardStart + 1);
          var card = html.slice(cardStart, cardEnd >= 0 ? cardEnd : cardStart + 6000);
          imageTag = (card.match(/<img\b[^>]*>/i) || [""])[0];
        }
      }
      var image = extractAttribute(imageTag, "data-src") || extractAttribute(imageTag, "data-original") || extractAttribute(imageTag, "src");
      if (image) posterByPath[match[2]] = normalizePosterUrl(absoluteUrl(decodeHtml(image), provider.baseUrl));
      var title = decodeHtml(extractAttribute("<a " + match[1] + ">", "title") || extractAttribute(imageTag, "alt") || cleanText(match[3]));
      if (!title) continue;
      var old = itemByPath[match[2]];
      if (old) { if (image) old.posterPath = posterByPath[match[2]]; continue; }
      var context = {id: provider.name + ":" + match[2], title: title, url: absoluteUrl(match[2], provider.baseUrl), providerUrl: provider.baseUrl};
      var item = {id:context.id,type:"url",title:provider.name + " | 云盘 · " + title,
        mediaType:"tv",posterPath:posterByPath[match[2]] || "",link:encodeCloudLink(context)};
      itemByPath[match[2]] = item; items.push(item);
    }
    for (var i=0;i<items.length;i++) {
      var context = decodeCloudLink(items[i].link);
      var path = context.url.slice(provider.baseUrl.length);
      items[i].posterPath = posterByPath[path] || items[i].posterPath || "";
      items[i].coverUrl=items[i].posterPath;items[i].backdropPath=items[i].posterPath;
      context.poster = items[i].posterPath;items[i].link=encodeCloudLink(context);
    }
    return items.slice(0,60);
  }));
  return interleaveGroups(groups,60);
}

function normalizePosterUrl(value) {
  var text=String(value||"").replace(/&amp;/gi,"&").trim();
  // Source-specific image header annotations are not part of the image URL.
  var index=text.search(/[?&]?@(?:Referer|User-Agent)=/i);
  if(index>=0)text=text.slice(0,index);
  return text;
}

// ---------- 分类浏览（1.6.0） ----------
// MacCMS 标准分类树：父分类(电影片/连续剧/综艺片/动漫片)本身没有条目，
// 条目挂在叶子分类下，所以「电影」「综艺」必须展开子分类再抓。
var BROWSE_CATEGORIES = [
  { key: "guoman", title: "国漫", match: ["国产动漫", "国漫", "国产动画"] },
  { key: "guoju", title: "国产剧", match: ["国产剧", "大陆剧", "国产电视"] },
  { key: "movie", title: "电影", match: ["电影片", "电影"], expandChildren: true },
  { key: "hanju", title: "韩剧", match: ["韩国剧", "韩剧"] },
  { key: "meiju", title: "美剧", match: ["欧美剧", "美剧", "美国剧"] },
  { key: "riman", title: "日漫", match: ["日韩动漫", "日本动漫"] },
  { key: "gangju", title: "港剧", match: ["香港剧", "港剧"] },
  { key: "taiju", title: "台剧", match: ["台湾剧", "台剧"] },
  { key: "riju", title: "日剧", match: ["日本剧", "日剧"] },
  { key: "taiju2", title: "泰剧", match: ["泰国剧", "泰剧"] },
  { key: "zongyi", title: "综艺", match: ["综艺片", "综艺"], expandChildren: true },
  { key: "duanju", title: "短剧", match: ["短剧"] },
];
var BROWSE_CLASS_TTL = 21600;
var BROWSE_MAX_TYPES_PER_SOURCE = 3;
// 注意：Forward 的 JS 运行时（iOS JavaScriptCore）不提供 setTimeout，
// 因此这里不做 Promise.race 式的超时保护。慢源由 Widget.http.get 自身的
// timeout 选项兜底，不会永久挂起。

function browseSpec(key) {
  var wanted = String(key || "").trim();
  for (var i = 0; i < BROWSE_CATEGORIES.length; i += 1) {
    if (BROWSE_CATEGORIES[i].key === wanted || BROWSE_CATEGORIES[i].title === wanted) {
      return BROWSE_CATEGORIES[i];
    }
  }
  return null;
}

async function macClassList(provider) {
  var key = "mac-class-v1:" + provider.baseUrl;
  var cached = cacheGet(key);
  if (Array.isArray(cached) && cached.length) return cached;
  var response = await Widget.http.get(buildUrl(provider.baseUrl, { ac: "list", at: "json" }), {
    headers: { "User-Agent": USER_AGENT, Referer: provider.baseUrl },
    timeout: provider.timeoutMs || 12000,
  });
  var data = asJson(response.data);
  var classes = data && data.class;
  if (!Array.isArray(classes) || !classes.length) return [];
  cacheSet(key, classes, BROWSE_CLASS_TTL);
  return classes;
}

function resolveBrowseTypeIds(classes, spec) {
  var matched = [];
  for (var i = 0; i < classes.length; i += 1) {
    var name = String(classes[i].type_name || "");
    for (var j = 0; j < spec.match.length; j += 1) {
      if (name === spec.match[j] || name.indexOf(spec.match[j]) >= 0) {
        matched.push(classes[i]);
        break;
      }
    }
  }
  if (!matched.length) return [];
  var ids = [], seen = {};
  if (spec.expandChildren) {
    var parentIds = {};
    matched.forEach(function (c) { parentIds[String(c.type_id)] = true; });
    classes.forEach(function (c) {
      var pid = String(c.type_pid || "0");
      if (pid !== "0" && parentIds[pid] && !seen[String(c.type_id)]) {
        seen[String(c.type_id)] = true;
        ids.push(String(c.type_id));
      }
    });
    if (ids.length) return ids;
  }
  matched.forEach(function (c) {
    if (!seen[String(c.type_id)]) { seen[String(c.type_id)] = true; ids.push(String(c.type_id)); }
  });
  return ids;
}

async function loadBrowse(params) {
  params = params || {};
  var spec = browseSpec(params.category || params.genreId || "guoman");
  if (!spec) throw new Error("未识别的分类：" + (params.category || params.genreId));
  var page = String(params.page || 1);
  var limit = Math.max(10, Math.min(100, Number(params.count || 30) || 30));
  var providers = macProviders(params.directProviderUrls, params.extraSourcesMode);
  console.log("[iBox160] browse " + JSON.stringify({ category: spec.title, page: page, providers: providers.length }));

  var groups = await Promise.all(providers.map(async function (provider) {
    try {
      var classes = await macClassList(provider);
      var typeIds = resolveBrowseTypeIds(classes, spec);
      if (!typeIds.length) return [];
      var slice = typeIds.slice(0, BROWSE_MAX_TYPES_PER_SOURCE);
      var pages = await Promise.all(slice.map(function (typeId) {
        return queryMac(provider, { ac: "detail", t: typeId, pg: page })
          .then(function (items) {
            return items.map(function (item) { return macListItem(item, provider); });
          })
          .catch(function () { return []; });
      }));
      var merged = [];
      pages.forEach(function (arr) { merged = merged.concat(arr); });
      return merged;
    } catch (error) {
      console.log("[iBox160] browse source skipped " + provider.name + " " + safeError(error));
      return [];
    }
  }));

  var items = interleaveGroups(groups, limit);
  if (!items.length) throw new Error(spec.title + " 暂无数据；可换个分类、翻页，或稍后再试");
  console.log("[iBox160] browse result " + JSON.stringify({ category: spec.title, count: items.length }));
  return items;
}

function macProviders(value, extraMode) {
  var defaults = "播剧网|https://ysxq.cc/api.php/provide/vod/\niBox采集A|http://149.104.6.155:12121/api.php/provide/vod/\niBox采集B|http://38.76.166.26:7788/api.php/provide/vod/";
  var providers=parseProviders(String(value||"").trim()||defaults);
  if(extraMode!=="off"){
    var additional=parseProviders("非凡资源|https://api.ffzyapi.com/api.php/provide/vod/\n天涯资源|https://tyyszy.com/api.php/provide/vod/\n如意资源|https://cj.rycjapi.com/api.php/provide/vod/\n量子资源|https://cj.lziapi.com/api.php/provide/vod/\n魔都资源|https://caiji.moduapi.cc/api.php/provide/vod/\n暴风资源|https://bfzyapi.com/api.php/provide/vod/\n360资源|https://360zyzz.com/api.php/provide/vod/\n闪电资源|https://sdzyapi.com/api.php/provide/vod/\n无尽资源|https://api.wujinapi.com/api.php/provide/vod/\n优酷资源|https://api.ukuapi.com/api.php/provide/vod/\n红牛资源|https://www.hongniuzy2.com/api.php/provide/vod/\n速播资源|https://subocaiji.com/api.php/provide/vod/\n金鹰资源|https://jyzyapi.com/api.php/provide/vod/\n光速资源|https://api.guangsuapi.com/api.php/provide/vod/\n虎牙资源|https://www.huyaapi.com/api.php/provide/vod/\n豪华资源|https://hhzyapi.com/api.php/provide/vod/\n极速资源|https://jszyapi.com/api.php/provide/vod/\n多多资源|https://api.ddapi.cc/api.php/provide/vod/");
    additional.forEach(function(provider){provider.timeoutMs=6000;providers.push(provider);});
  }
  var seen={};return providers.filter(function(provider){var key=provider.baseUrl.replace(/\/+$/,"").toLowerCase();if(seen[key])return false;seen[key]=true;return true;});
}

function interleaveGroups(groups, limit) {
  var result = [], seen = {}, index = 0, added = true;
  while (result.length < limit && added) {
    added = false;
    for (var i=0;i<groups.length;i++) {
      var item = groups[i] && groups[i][index];
      if (item && !seen[item.id]) {seen[item.id]=true;result.push(item);added=true;}
      if (result.length>=limit) break;
    }
    index++;
  }
  return result;
}

var MAC_QUERY_INFLIGHT={};
async function queryMac(provider,params) {
  var key="mac-query-v2:"+buildUrl(provider.baseUrl,params),cached=cacheGet(key);
  if(Array.isArray(cached))return cached;
  if(params.ids && /^\d+$/.test(String(params.ids))){
    var detail=cacheGet("mac-detail-v2:"+provider.baseUrl+":"+params.ids);
    if(detail)return [detail];
  }
  if(MAC_QUERY_INFLIGHT[key])return await MAC_QUERY_INFLIGHT[key];
  var job=(async function(){
    var response=await Widget.http.get(buildUrl(provider.baseUrl,params),{
      headers:{"User-Agent":USER_AGENT,Referer:provider.baseUrl},timeout:provider.timeoutMs||12000});
    var data=asJson(response.data);
    if(!Array.isArray(data.list))throw new Error(provider.name+" 没有返回资源列表");
    cacheSet(key,data.list,data.list.length?180:45);
    data.list.forEach(function(item){
      if(item.vod_id && item.vod_play_url)cacheSet("mac-detail-v2:"+provider.baseUrl+":"+item.vod_id,item,180);
    });
    return data.list;
  })();
  MAC_QUERY_INFLIGHT[key]=job;
  try{return await job;}finally{delete MAC_QUERY_INFLIGHT[key];}
}

function macListItem(item, provider) {
  var playGroups=String(item.vod_play_url||"").split("$$$").filter(function(group){return !!group;});
  var onePartAnime=/(?:动漫|动画)/.test(String(item.type_name||"")) && playGroups.length>0 && playGroups.every(function(group){return group.split("#").filter(function(x){return !!x;}).length===1;});
  var context={kind:"maccms",vodId:String(item.vod_id),api:provider.baseUrl,sourceName:provider.name,
    id:"mac:"+provider.baseUrl+":"+item.vod_id,title:String(item.vod_name||""),year:String(item.vod_year||""),animationOnePart:onePartAnime,poster:normalizePosterUrl(String(item.vod_pic||item.vod_pic_thumb||""))};
  return {id:context.id,type:"url",title:provider.name+" | "+context.title,
    description:String(item.vod_remarks||item.type_name||""),mediaType:macMediaType(item),
    posterPath:context.poster,coverUrl:context.poster,backdropPath:String(item.vod_pic_slide||context.poster),link:encodeCloudLink(context)};
}

function macMediaType(item) {
  return String(item.type_id_1||item.type_id)==="1" || /电影|短片|动作片|喜剧片|爱情片|科幻片|恐怖片|剧情片|战争片|纪录片/.test(String(item.type_name||"")) ? "movie" : "tv";
}

async function listCloud(params) {
  params=params||{};var jobs=[listBaiduCloud(params).catch(function(){return [];})];
  macProviders(params.directProviderUrls,params.extraSourcesMode).forEach(function(provider){
    jobs.push(queryMac(provider,{ac:"detail",pg:String(params.page||1)}).then(function(items){
      return items.map(function(item){return macListItem(item,provider);});
    }).catch(function(){return [];}));
  });
  var groups=await Promise.all(jobs);var items=interleaveGroups(groups,100);
  if(!items.length) throw new Error("全部资源源暂时未返回数据，请检查网络后重试");
  return items;
}

// Independently sourced share, verified by reading S01E01 coded dimensions (3840x2160).
// This is a curated entry, not a claim that an entire channel has been integrated.
var VERIFIED_CLOUD_CATALOG=[{
  id:"dawang-raoming-2021-s1-s2",title:"大王饶命",mediaType:"tv",year:"2021",seasons:[1,2],
  shares:[{url:"https://pan.baidu.com/s/1gWMpY4qbzaixUEhe3hkdqg?pwd=46z4"}],
  evidence:"https://t.me/s/Aliyun_4K_Movies?before=52551"
}];
function verifiedCatalogItems(keyword,mode){
  if(mode==="off")return [];
  var key=resourceTitleKey(stripSeriesSeason(keyword));
  return VERIFIED_CLOUD_CATALOG.filter(function(entry){return key===resourceTitleKey(entry.title);}).map(function(entry){
    var context={catalogEntry:true,id:"verified-cloud:"+entry.id,title:entry.title,mediaType:entry.mediaType,year:entry.year,seasons:entry.seasons,shares:entry.shares};
    return {id:context.id,type:"url",title:"补充云盘 | "+entry.title,mediaType:entry.mediaType,link:encodeCloudLink(context)};
  });
}

async function searchCloud(params) {
  params=params||{};var keyword=String(params.keyword||params.query||"").trim();
  if(!keyword)return await listCloud(params);
  var jobs=[Promise.resolve(verifiedCatalogItems(keyword,params.extraSourcesMode)),searchBaiduCloud(params).catch(function(){return [];})];
  macProviders(params.directProviderUrls,params.extraSourcesMode).forEach(function(provider){
    jobs.push(queryMac(provider,{ac:"detail",wd:keyword,pg:String(params.page||1)}).then(function(items){
      return items.map(function(item){return macListItem(item,provider);});
    }).catch(function(){return [];}));
  });
  return interleaveGroups(await Promise.all(jobs),500);
}

async function loadMacDetail(context) {
  var provider={name:context.sourceName,baseUrl:context.api};
  var list=await queryMac(provider,{ac:"detail",ids:context.vodId});
  var item=null;for(var i=0;i<list.length;i++)if(String(list[i].vod_id)===context.vodId){item=list[i];break;}
  if(!item)throw new Error("源站没有返回这部影片的详情");
  var names=String(item.vod_play_from||"").split("$$$");
  var lines=String(item.vod_play_url||"").split("$$$");var groups={},order=[];
  for(var line=0;line<lines.length;line++){
    var entries=lines[line].split("#");
    for(var j=0;j<entries.length;j++){
      var entry=entries[j];var sep=entry.indexOf("$");var title=sep>=0?entry.slice(0,sep):"正片";
      var url=sep>=0?entry.slice(sep+1):entry;
      if(!/^https?:\/\//i.test(url))continue;
      var info=parseEpisodeInfo(title);var episode=info?info.episode:j+1;var season=info?info.season:1;var key=season+":"+episode;
      if(!groups[key]){groups[key]={title:title||"第"+episode+"集",season:season,episode:episode,streams:[]};order.push(groups[key]);}
      groups[key].streams.push({name:context.sourceName+" · "+(names[line]||"线路"+(line+1)),url:url,referer:context.api});
    }
  }
  order.sort(function(a,b){return a.season-b.season||a.episode-b.episode;});
  var poster=normalizePosterUrl(String(item.vod_pic||context.poster||""));
  var episodes=order.map(function(e){return {id:context.id+"#S"+e.season+"E"+e.episode,type:"url",title:e.title,
    season:e.season,episode:e.episode,mediaType:macMediaType(item),posterPath:poster,
    link:encodeCloudLink({kind:"maccmsEpisode",streams:e.streams,sourceName:context.sourceName,
      title:String(item.vod_name||context.title||""),year:String(item.vod_year||context.year||""),
      season:e.season,episode:e.episode,mediaType:macMediaType(item)})};});
  return {id:context.id,type:"url",title:String(item.vod_name||context.title),description:cleanText(item.vod_content||item.vod_blurb||""),
    posterPath:poster,coverUrl:poster,backdropPath:String(item.vod_pic_slide||poster),mediaType:macMediaType(item),
    link:encodeCloudLink(context),episodeItems:episodes};
}

async function loadMacResources(context, params) {
  if(context.kind==="maccms"){
    var detail=await loadMacDetail(context);var ep=Number(params.episode||1);var selected=null;
    for(var i=0;i<detail.episodeItems.length;i++)if(detail.episodeItems[i].episode===ep){selected=detail.episodeItems[i];break;}
    if(!selected)throw new Error("该资源暂时没有剧集");context=decodeCloudLink(selected.link);
  }
  var resources=[],pages=[];
  for(var j=0;j<(context.streams||[]).length;j++){
    var stream=context.streams[j];
    if(!isMediaAddress(stream.url)){pages.push(stream);continue;}
    resources.push(makeWebResource(stream,stream.url,"源站直连"));
  }
  if(resources.length)return resources;
  if(params._directOnly)return [];
  var failures=[];
  var fallbackJob=findCrossSourceMedia(context,params).catch(function(error){return [];});
  var groups=await Promise.all(pages.slice(0,3).map(async function(stream){
    try {
      var media=await resolvePlayerPage(stream.url);
      return media.map(function(item){
        var resource=makeWebResource(stream,item.url,item.description||"网页公开播放地址",item.referer||stream.url);
        if(item.label)resource.name+=" · "+item.label;
        return resource;
      });
    } catch(error){failures.push(stream.name+": "+safeError(error));return [];}
  }));
  groups.forEach(function(group){resources=resources.concat(group);});
  var fallback=await fallbackJob;
  if(fallback.length)resources=fallback.concat(resources);
  if(!resources.length)throw new Error("网页解析未得到可播媒体；"+failures.join("；"));
  return resources;
}

async function findCrossSourceMedia(context,params) {
  if(!context.title || params._skipCrossSource)return [];
  function titleKey(value){return String(value||"").replace(/[\s\u3000·•]/g,"").toLowerCase();}
  var providers=macProviders(params.directProviderUrls,params.extraSourcesMode).filter(function(p){return p.name!==context.sourceName;});
  // 播放链路限流：源数量增加后只取前 12 个做跨源匹配，避免起播时并发查询过多拖慢手机
  var MAX_CROSS_SOURCE=12;if(providers.length>MAX_CROSS_SOURCE)providers=providers.slice(0,MAX_CROSS_SOURCE);
  // Only exact identity matches are allowed; never silently substitute a similarly named film.
  var groups=await Promise.all(providers.map(async function(provider){
    try {
      var cacheKey="cross-source:"+provider.baseUrl+":"+context.title+":"+context.year;
      var list=cacheGet(cacheKey);
      if(!list){list=await queryMac(provider,{ac:"detail",wd:context.title,pg:"1"});cacheSet(cacheKey,list,300);}
      var matches=list.filter(function(item){
        if(titleKey(item.vod_name)!==titleKey(context.title))return false;
        if(context.year && String(item.vod_year||"")!==String(context.year))return false;
        if(context.mediaType && macMediaType(item)!==context.mediaType)return false;
        return true;
      });
      if(matches.length!==1)return [];
      var root=macListItem(matches[0],provider);
      var detail=await loadMacDetail(decodeCloudLink(root.link));
      var episode=null;
      for(var i=0;i<detail.episodeItems.length;i++){
        var e=detail.episodeItems[i];
        if(e.episode===Number(context.episode||1) && e.season===Number(context.season||1)){episode=e;break;}
      }
      if(!episode)return [];
      var child=decodeCloudLink(episode.link),result=[];
      for(var j=0;j<child.streams.length;j++){
        var stream=child.streams[j];if(!isMediaAddress(stream.url))continue;
        var resource=makeWebResource(stream,stream.url,"同名同年同集跨源匹配 · "+context.title);
        resource.name="跨源匹配 · "+resource.name;result.push(resource);
      }
      return result;
    }catch(error){return [];}
  }));
  var result=[];groups.forEach(function(g){result=result.concat(g);});return result;
}

function isMediaAddress(url) {
  return /^https?:\/\//i.test(String(url||"")) && /\.(m3u8|mp4|m4v|webm|mkv|mov|flv|ts)(?:$|[?#])/i.test(String(url));
}

function makeWebResource(stream,url,description,referer) {
  return {name:stream.name,description:description,url:url,
    customHeaders:{"User-Agent":USER_AGENT,Referer:referer||stream.referer,"Accept-Encoding":"identity"},
    playerType:/\.(m3u8|mp4|m4v|mov)(?:$|[?#])/i.test(url)?"system":"app"};
}

function jsonAssignment(html,name) {
  var pattern=new RegExp("(?:var|let|const)\\s+"+name+"\\s*=\\s*|(?:window\\.)?"+name+"\\s*=\\s*");
  var match=pattern.exec(html);if(!match)return null;
  var start=match.index+match[0].length;
  if(html.charAt(start)!=="{")return null;
  var depth=0,quoted=false,escaped=false;
  for(var i=start;i<html.length;i++){
    var ch=html.charAt(i);
    if(quoted){if(escaped)escaped=false;else if(ch==="\\")escaped=true;else if(ch==='"')quoted=false;continue;}
    if(ch==='"')quoted=true;else if(ch==="{")depth++;else if(ch==="}"){
      depth--;if(depth===0){try{return JSON.parse(html.slice(start,i+1));}catch(error){return null;}}
    }
  }
  return null;
}

function decodeBase64PlayerUrl(value) {
  var alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var input=String(value||"").replace(/\s+/g,"").replace(/-/g,"+").replace(/_/g,"/");
  if(input.length>20000 || /[^A-Za-z0-9+/=]/.test(input))throw new Error("播放器地址编码无效");
  var bytes=[],buffer=0,bits=0;
  for(var i=0;i<input.length;i++){
    var ch=input.charAt(i);if(ch==="=")break;var n=alphabet.indexOf(ch);if(n<0)continue;
    buffer=(buffer<<6)|n;bits+=6;if(bits>=8){bits-=8;bytes.push((buffer>>bits)&255);}
  }
  var encoded=bytes.map(function(b){return "%"+("0"+b.toString(16)).slice(-2);}).join("");
  try{return decodeURIComponent(encoded);}catch(error){throw new Error("播放器地址不是有效 UTF-8");}
}

function parsePlayerPage(html,pageUrl) {
  var text=String(html||"");var media=[],next=[],seen={};
  function add(url,options){
    var value=String(url||"").replace(/\\\//g,"/").replace(/&amp;/g,"&");
    if(!isMediaAddress(value)||seen[value])return;
    seen[value]=true;options=options||{};options.url=value;options.referer=pageUrl;media.push(options);
  }
  var host=(/^https?:\/\/([^/]+)/i.exec(pageUrl)||[])[1]||"";
  if(/(^|\.)bilibili\.com$/i.test(host)){
    var ssr=jsonAssignment(text,"playurlSSRData");
    var data=ssr&&ssr.data&&ssr.data.result;
    var video=data&&data.video_info;
    if(video){
      var alternatives=[{durl:video.durl,quality:video.quality}].concat(video.durls||[]);
      for(var a=0;a<alternatives.length;a++){
        var candidate=alternatives[a];var segments=candidate.durl;
        if(!Array.isArray(segments)||segments.length!==1)continue;
        var length=Number(segments[0].length||0);
        var preview=video.is_preview===true || (Number(video.timelength||0)>0 && length>0 && length+30000<Number(video.timelength));
        var label=preview?"公开试看 "+Math.max(1,Math.round(length/60000))+"分钟":"公开线路";
        var qualityLabels={120:"4K",112:"1080P+",80:"1080P",64:"720P",32:"480P",16:"360P"};
        if(qualityLabels[candidate.quality])label+=" · "+qualityLabels[candidate.quality];
        add(segments[0].url,{label:label,description:preview?"平台返回的试看地址，不是完整正片":"页面内公开完整播放地址",preview:preview});
      }
    }
    // Do not scrape unrelated recommendation or trailer URLs out of platform HTML.
    return {media:media,next:next};
  }
  var assignment=/\b(?:var|let|const)\s+(player_[A-Za-z0-9_]+)\s*=/g,match;
  while((match=assignment.exec(text))){
    var config=jsonAssignment(text,match[1]);if(!config||!config.url)continue;
    var url=String(config.url);
    try {
      if(Number(config.encrypt)===2)url=decodeBase64PlayerUrl(url);
      if(Number(config.encrypt)===1 || /^(?:https?%3a)/i.test(url))url=decodeURIComponent(url);
      if(isMediaAddress(url))add(url);else if(/^https?:\/\//i.test(url))next.push(url);
    }catch(error){}
  }
  var videoPattern=/<video\b[^>]*>[\s\S]*?<\/video>/gi;
  while((match=videoPattern.exec(text))){
    var tags=match[0].match(/<(?:video|source)\b[^>]*>/gi)||[];
    for(var v=0;v<tags.length;v++){
      var src=extractAttribute(tags[v],"src");if(src)add(resolveRedirectUrl(decodeHtml(src),pageUrl));
    }
  }
  var iframePattern=/<iframe\b[^>]*>/gi;
  while((match=iframePattern.exec(text))){
    var tag=match[0];var identity=extractAttribute(tag,"id")+" "+extractAttribute(tag,"class")+" "+extractAttribute(tag,"name");
    if(!/player|video|\bjx\b/i.test(identity))continue;
    var src=extractAttribute(tag,"src");if(src)next.push(resolveRedirectUrl(decodeHtml(src),pageUrl));
  }
  return {media:media,next:next};
}

async function resolvePlayerPage(url) {
  var queue=[{url:url,depth:0}],visited={},failures=[];
  while(queue.length && Object.keys(visited).length<3){
    var entry=queue.shift();if(visited[entry.url]||entry.depth>1)continue;visited[entry.url]=true;
    var host=(/^https?:\/\/([^/:]+)/i.exec(entry.url)||[])[1]||"";
    if(!host || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(host))continue;
    try {
      var response=await Widget.http.get(entry.url,{headers:{"User-Agent":USER_AGENT,Referer:url},timeout:12000});
      var status=Number(response.status||response.statusCode||200);
      if(status>=400){failures.push(host+" HTTP "+status);continue;}
      var parsed=parsePlayerPage(asText(response.data),entry.url);
      if(parsed.media.length)return parsed.media;
      parsed.next.slice(0,2).forEach(function(next){queue.push({url:next,depth:entry.depth+1});});
      if(!parsed.next.length)failures.push(host+" 没有公开可直接播放的媒体地址");
    }catch(error){failures.push(host+" "+safeError(error));}
  }
  throw new Error(failures.join("；")||"未取得公开播放地址");
}

function asText(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function asJson(value) {
  if (value && typeof value === "object") return value;
  var text = String(value || "");
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("JSON 解析失败:", text.slice(0, 200));
    throw error;
  }
}

function extractJsonCall(text, marker) {
  var value = String(text || "");
  var start = value.indexOf(marker + "(");
  if (start < 0) return null;
  var braceStart = value.indexOf("{", start);
  if (braceStart < 0) return null;
  var depth = 0;
  var quoted = false;
  var escaped = false;
  for (var i = braceStart; i < value.length; i += 1) {
    var character = value.charAt(i);
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(value.slice(braceStart, i + 1));
        } catch (error) {
          return null;
        }
      }
    }
  }
  return null;
}

function findDirectUrl(root) {
  var queue = [root];
  var fallback = [];
  while (queue.length) {
    var value = queue.shift();
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      fallback.push(value);
    } else if (Array.isArray(value)) {
      queue = queue.concat(value);
    } else if (value && typeof value === "object") {
      for (var key in value) {
        var entry = value[key];
        if (typeof entry === "string" && /^https?:\/\//i.test(entry)) {
          if (/^(dlink|downloadurl|download_url|url)$/i.test(key)) return entry;
          fallback.push(entry);
        } else {
          queue.push(entry);
        }
      }
    }
  }
  return fallback[0] || "";
}

function buildUrl(base, params) {
  var pairs = [];
  for (var key in params) {
    if (
      Object.prototype.hasOwnProperty.call(params, key) &&
      params[key] !== undefined &&
      params[key] !== null
    ) {
      pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
    }
  }
  return base + (base.indexOf("?") >= 0 ? "&" : "?") + pairs.join("&");
}

function decodeSekey(sekey) {
  var value = String(sekey || "");
  if (value.indexOf("%") < 0) return value;
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function absoluteUrl(value, baseUrl) {
  var text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf("//") === 0) return "https:" + text;
  if (text.charAt(0) === "/") return baseUrl.replace(/\/+$/, "") + text;
  return baseUrl.replace(/\/+$/, "") + "/" + text;
}

function encodeCloudLink(object) {
  return "iboxcloud:" + encodeURIComponent(JSON.stringify(object));
}

function decodeCloudLink(value) {
  var text = String(value || "");
  if (text.indexOf("iboxcloud:") === 0) {
    text = text.slice("iboxcloud:".length);
  }
  try {
    return JSON.parse(decodeURIComponent(text));
  } catch (error) {
    return null;
  }
}

function decodeHtml(value) {
  return cleanText(
    String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">"),
  );
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(value, regexp) {
  var match = regexp.exec(String(value || ""));
  return match ? match[1] : "";
}

function naturalCompare(left, right) {
  var leftParts = String(left).match(/(\d+|\D+)/g) || [];
  var rightParts = String(right).match(/(\d+|\D+)/g) || [];
  for (var i = 0; i < Math.min(leftParts.length, rightParts.length); i += 1) {
    var leftPart = leftParts[i];
    var rightPart = rightParts[i];
    var leftNumber = /^\d+$/.test(leftPart);
    var rightNumber = /^\d+$/.test(rightPart);
    if (leftNumber && rightNumber) {
      var difference = Number(leftPart) - Number(rightPart);
      if (difference !== 0) return difference;
    } else if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }
  return leftParts.length - rightParts.length;
}

function sha1Hex(input) {
  var message = String(input || "");
  var bytes = [];
  for (var i = 0; i < message.length; i += 1) {
    var code = message.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  var bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (var shift = 56; shift >= 0; shift -= 8) {
    bytes.push((bitLength / Math.pow(2, shift)) & 0xff);
  }

  var h0 = 0x67452301;
  var h1 = 0xefcdab89;
  var h2 = 0x98badcfe;
  var h3 = 0x10325476;
  var h4 = 0xc3d2e1f0;

  for (var offset = 0; offset < bytes.length; offset += 64) {
    var words = [];
    for (var w = 0; w < 16; w += 1) {
      words[w] =
        (bytes[offset + w * 4] << 24) |
        (bytes[offset + w * 4 + 1] << 16) |
        (bytes[offset + w * 4 + 2] << 8) |
        bytes[offset + w * 4 + 3];
    }
    for (var j = 16; j < 80; j += 1) {
      words[j] = rotateLeft(
        words[j - 3] ^ words[j - 8] ^ words[j - 14] ^ words[j - 16],
        1,
      );
    }

    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;
    for (var round = 0; round < 80; round += 1) {
      var f;
      var k;
      if (round < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (round < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (round < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      var temp = (rotateLeft(a, 5) + f + e + k + words[round]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4]
    .map(function (value) {
      return ("00000000" + value.toString(16)).slice(-8);
    })
    .join("");
}

function rotateLeft(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/* ==========================================================================
 * 私人媒体服务器适配器（Emby / Jellyfin）1.5.2
 * --------------------------------------------------------------------------
 * 只读：/System/Info/Public → /Users(Public) → /Users/{id}/Items → /Videos/{id}/stream
 * 不写对方任何状态：不上报播放进度、不建转码会话；static=true 直出原文件。
 * 令牌只存在于模块设置里，不写进日志。
 * ======================================================================== */

var EMBY_CACHE = {};

function parseEmbyServers(value) {
  var servers = [];
  String(value || "").split(/\r?\n/).forEach(function (line, index) {
    var text = String(line || "").trim();
    if (!text || text.charAt(0) === "#") return;
    var parts = text.split("|").map(function (part) { return String(part || "").trim(); });
    var baseUrl = parts.length > 1 ? parts[1] : parts[0];
    if (!/^https?:\/\//i.test(baseUrl)) return;
    servers.push({
      id: "emby-" + (index + 1),
      name: parts.length > 1 && parts[0] ? parts[0] : "私人服务器" + (index + 1),
      baseUrl: baseUrl.replace(/\/+$/, ""),
      token: parts[2] || "",
      userId: parts[3] || "",
      prefix: "",
    });
  });
  return servers;
}

function embyUrl(server, path) {
  var url = server.baseUrl + (server.prefix || "") + path;
  if (server.token) url += (path.indexOf("?") >= 0 ? "&" : "?") + "api_key=" + encodeURIComponent(server.token);
  return url;
}

async function embyJson(server, path) {
  var text = await httpText(embyUrl(server, path), server.baseUrl + "/");
  var raw = String(text || "").trim();
  var start = raw.search(/[[{]/);
  if (start < 0) throw new Error("不是 JSON 响应");
  var endGroup = raw.charAt(start) === "[" ? "]" : "}";
  var end = raw.lastIndexOf(endGroup);
  if (end <= start) throw new Error("JSON 截断");
  return JSON.parse(raw.slice(start, end + 1));
}

async function embyProbe(server) {
  if (EMBY_CACHE[server.baseUrl]) {
    server.prefix = EMBY_CACHE[server.baseUrl].prefix;
    return EMBY_CACHE[server.baseUrl];
  }
  var prefixes = ["/emby", ""];
  var lastError = null;
  for (var i = 0; i < prefixes.length; i += 1) {
    var probe = { baseUrl: server.baseUrl, prefix: prefixes[i], token: server.token };
    try {
      var info = await embyJson(probe, "/System/Info/Public");
      if (info && (info.ServerName || info.Id)) {
        var record = { prefix: prefixes[i], name: info.ServerName || "", version: info.Version || "" };
        EMBY_CACHE[server.baseUrl] = record;
        server.prefix = record.prefix;
        console.log("[iBox152] emby probe " + JSON.stringify({ server: server.name, prefix: record.prefix, version: record.version }));
        return record;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("不是 Emby/Jellyfin" + (lastError ? "：" + safeError(lastError) : ""));
}

async function embyResolveUser(server) {
  if (server.userId) return server.userId;
  if (server.token) {
    try {
      var users = await embyJson(server, "/Users");
      if (Array.isArray(users) && users.length) return users[0].Id;
    } catch (error) { /* 继续走公开账号 */ }
    try {
      var me = await embyJson(server, "/Users/Me");
      if (me && me.Id) return me.Id;
    } catch (error) { /* 继续 */ }
  }
  var publicUsers = await embyJson(server, "/Users/Public");
  if (Array.isArray(publicUsers) && publicUsers.length) {
    for (var i = 0; i < publicUsers.length; i += 1) {
      if (!publicUsers[i].HasPassword) return publicUsers[i].Id;
    }
    return publicUsers[0].Id;
  }
  throw new Error("没有可用账号");
}

async function embySearchItems(server, userId, term) {
  var path =
    "/Users/" + encodeURIComponent(userId) + "/Items?Recursive=true" +
    "&IncludeItemTypes=Movie,Series&Fields=Path,MediaSources,ProductionYear" +
    "&Limit=24&SearchTerm=" + encodeURIComponent(term);
  var data = await embyJson(server, path);
  return (data && data.Items) || [];
}

async function embyEpisodes(server, userId, seriesId, season) {
  var path =
    "/Shows/" + encodeURIComponent(seriesId) + "/Episodes?UserId=" + encodeURIComponent(userId) +
    "&Season=" + encodeURIComponent(String(season)) +
    "&Fields=Path,MediaSources,ProductionYear";
  var data = await embyJson(server, path);
  return (data && data.Items) || [];
}

function embyStreamUrl(server, item, mediaSourceId) {
  var url =
    server.baseUrl + (server.prefix || "") + "/Videos/" + encodeURIComponent(item.Id) +
    "/stream?static=true&MediaSourceId=" + encodeURIComponent(mediaSourceId || item.Id);
  if (server.token) url += "&api_key=" + encodeURIComponent(server.token);
  return url;
}

function embyResource(server, item, season, episode) {
  var sources = item.MediaSources || [];
  var source = sources[0] || {};
  var height = Number(source.Height || 0);
  var label = server.name + (height ? " · " + height + "p" : " · 原文件");
  if (season) label += " S" + season + "E" + episode;
  return {
    name: label,
    description: "私人媒体服务器直连 · " + server.baseUrl.replace(/^https?:\/\//i, ""),
    url: embyStreamUrl(server, item, source.Id),
    customHeaders: { "User-Agent": USER_AGENT, "Accept-Encoding": "identity" },
    playerType: "app",
  };
}

async function resolveEmbyResources(params, identity) {
  var servers = parseEmbyServers(params.embyServers);
  if (!servers.length) return [];
  var wanted = resourceTitleKey(identity.title);
  var titles = [identity.title, identity.originalTitle].filter(Boolean);
  var resources = [];

  for (var s = 0; s < servers.length; s += 1) {
    var server = servers[s];
    try {
      await embyProbe(server);
      var userId = await embyResolveUser(server);
      var items = [];
      for (var t = 0; t < titles.length && !items.length; t += 1) {
        items = await embySearchItems(server, userId, titles[t]);
      }
      var matched = items.filter(function (item) {
        var key = resourceTitleKey(item.Name);
        return key === wanted || (wanted && key.indexOf(wanted) >= 0);
      });
      if (!matched.length) {
        console.log("[iBox152] emby no match " + JSON.stringify({ server: server.name, title: identity.title, fetched: items.length }));
        continue;
      }
      for (var m = 0; m < matched.length; m += 1) {
        var item = matched[m];
        var type = String(item.Type || "").toLowerCase();
        if (identity.type === "tv" || type === "series") {
          var season = Number(identity.season || 1);
          var episode = Number(identity.episode || 1);
          var episodes = await embyEpisodes(server, userId, item.Id, season);
          var hit = null;
          for (var e = 0; e < episodes.length; e += 1) {
            if (Number(episodes[e].IndexNumber) === episode) { hit = episodes[e]; break; }
          }
          if (!hit) continue;
          resources.push(embyResource(server, hit, season, episode));
        } else {
          resources.push(embyResource(server, item, null, null));
        }
      }
    } catch (error) {
      console.error("[iBox152] emby failed " + JSON.stringify({ server: server.name, error: safeError(error) }));
    }
  }
  if (resources.length) console.log("[iBox152] emby ok " + JSON.stringify({ title: identity.title, count: resources.length }));
  return resources;
}

/* -------------------- 目录模块：让片库在 Forward 里可见 -------------------- */

/**
 * link 里自带服务器信息：Forward 的 loadDetail 只会收到 link，拿不到模块设置，
 * 所以配置必须随条目走，否则详情页/起播环节会因缺少配置而返回空。
 * 格式：fwd-private|<名称>|<地址>|<令牌>|<用户ID>|<条目ID>
 */
function privateLinkOf(server, itemId) {
  var safeName = String(server.name || "").replace(/\|/g, "/");
  return ["fwd-private", safeName, server.baseUrl, server.token || "", server.userId || "", itemId].join("|");
}

function parsePrivateLink(link) {
  var text = String(link || "");
  if (text.indexOf("fwd-private|") !== 0) return null;
  var parts = text.split("|");
  if (parts.length < 6) return null;
  var server = {
    id: "inline",
    name: parts[1] || "私人服务器",
    baseUrl: parts[2],
    token: parts[3] || "",
    userId: parts[4] || "",
    prefix: "",
  };
  if (!/^https?:\/\//i.test(server.baseUrl)) return null;
  return { server: server, itemId: parts[5] };
}

/** 列出一台服务器的全部影片/剧集，映射成 Forward 的 VideoItem */
async function loadPrivateLibrary(params) {
  params = params || {};
  rememberEmbySetting(params.embyServers);
  var servers = parseEmbyServers(params.embyServers);
  if (!servers.length) return [];
  var page = Number(params.page || 1) > 0 ? Number(params.page || 1) : 1;
  var count = Number(params.count || 30) > 0 ? Number(params.count || 30) : 30;
  var startIndex = (page - 1) * count;
  var items = [];

  for (var s = 0; s < servers.length; s += 1) {
    var server = servers[s];
    try {
      await embyProbe(server);
      var userId = await embyResolveUser(server);
      var path =
        "/Users/" + encodeURIComponent(userId) + "/Items?Recursive=true" +
        "&IncludeItemTypes=Movie,Series&Fields=Path,MediaSources,ProductionYear,Overview,CommunityRating" +
        "&SortBy=SortName&SortOrder=Ascending&StartIndex=" + startIndex + "&Limit=" + count;
      var data = await embyJson(server, path);
      var list = (data && data.Items) || [];
      for (var i = 0; i < list.length; i += 1) {
        var item = list[i];
        var type = String(item.Type || "").toLowerCase();
        var source = (item.MediaSources || [])[0] || {};
        var height = Number(source.Height || 0);
        var link = privateLinkOf(server, item.Id);
        items.push({
          id: link,
          type: "url",
          title: item.Name + (height ? " · " + height + "p" : ""),
          mediaType: type === "series" ? "tv" : "movie",
          link: link,
          description: (item.Overview ? String(item.Overview).slice(0, 200) + "\n\n" : "") +
            "来源：" + server.name + (item.ProductionYear ? " · " + item.ProductionYear : ""),
          posterPath: embyImageUrl(server, item),
          coverUrl: embyImageUrl(server, item),
        });
      }
      console.log("[iBox152] private library " + JSON.stringify({ server: server.name, count: list.length }));
    } catch (error) {
      console.error("[iBox152] private library failed " + JSON.stringify({ server: server.name, error: safeError(error) }));
    }
  }
  return items;
}

function embyImageUrl(server, item) {
  if (!item || !item.ImageTags || !item.ImageTags.Primary) return "";
  var url = server.baseUrl + (server.prefix || "") + "/Items/" + encodeURIComponent(item.Id) + "/Images/Primary?maxHeight=600";
  if (server.token) url += "&api_key=" + encodeURIComponent(server.token);
  return url;
}

/** 详情页：列出剧集的分集，便于选季选集 */
async function loadPrivateDetail(link) {
  var parsed = parsePrivateLink(link);
  if (!parsed) return null;
  var server = parsed.server;

  await embyProbe(server);
  var userId = await embyResolveUser(server);
  var item = await embyJson(server, "/Users/" + encodeURIComponent(userId) + "/Items/" + encodeURIComponent(parsed.itemId));
  if (!item || !item.Id) return null;

  var detail = {
    id: link,
    type: "url",
    title: item.Name,
    mediaType: String(item.Type || "").toLowerCase() === "series" ? "tv" : "movie",
    link: link,
    description: item.Overview || "",
    posterPath: embyImageUrl(server, item),
    coverUrl: embyImageUrl(server, item),
  };

  if (detail.mediaType === "tv") {
    var episodes = await embyJson(server,
      "/Shows/" + encodeURIComponent(item.Id) + "/Episodes?UserId=" + encodeURIComponent(userId) +
      "&Fields=Path,MediaSources,ProductionYear");
    detail.episodeItems = (episodes && episodes.Items || []).map(function (ep) {
      var epLink = privateLinkOf(server, ep.Id);
      return {
        id: epLink,
        type: "url",
        title: (ep.ParentIndexNumber ? "S" + ep.ParentIndexNumber : "") + "E" + (ep.IndexNumber || "") + " " + (ep.Name || ""),
        mediaType: "tv",
        link: epLink,
        season: ep.ParentIndexNumber || 1,
        episode: ep.IndexNumber || 1,
      };
    });
  }
  return detail;
}

/** 目录里只是条目列表，服务器配置本身来自模块设置 */
var EMBY_SETTING_CACHE = "";
function rememberEmbySetting(value) { if (value) EMBY_SETTING_CACHE = String(value); }
function loadEmbyServersSetting() { return EMBY_SETTING_CACHE; }

/** 从 private link 直接解析播放资源（目录点进来的路径） */
async function resourcesForPrivateLink(params) {
  var parsed = parsePrivateLink(params.link);
  if (!parsed) return [];
  var server = parsed.server;

  await embyProbe(server);
  var userId = await embyResolveUser(server);
  var item = await embyJson(server, "/Users/" + encodeURIComponent(userId) + "/Items/" + encodeURIComponent(parsed.itemId));
  if (!item || !item.Id) throw new Error("资源不存在或已移出库");

  // 直接点剧集：返回全部分集，交给客户端选集
  if (String(item.Type || "").toLowerCase() === "series") {
    var season = Number(params.season || 0);
    var query = "/Shows/" + encodeURIComponent(item.Id) + "/Episodes?UserId=" + encodeURIComponent(userId) +
      "&Fields=Path,MediaSources,ProductionYear" + (season ? "&Season=" + season : "");
    var episodes = await embyJson(server, query);
    var list = (episodes && episodes.Items) || [];
    var resources = [];
    for (var i = 0; i < list.length; i += 1) {
      resources.push(embyResource(server, list[i], list[i].ParentIndexNumber || 1, list[i].IndexNumber || (i + 1)));
    }
    if (!resources.length) throw new Error("该剧集没有可播放的分集");
    return resources;
  }

  return [embyResource(server, item, null, null)];
}


