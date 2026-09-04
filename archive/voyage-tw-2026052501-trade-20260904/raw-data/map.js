jQuery.loadScript = function (url, callback) {
    jQuery.ajax({
        url: url,
        cache: true,
        dataType: 'script',
        success: callback,
        async: true
    });
}
jQuery.event.special.touchstart = {
    setup: function( _, ns, handle ) {
        this.addEventListener("touchstart", handle, { passive: false });
    }
};
jQuery.event.special.touchmove = {
    setup: function( _, ns, handle ) {
        this.addEventListener("touchmove", handle, { passive: false });
    }
};
jQuery.event.special.wheel = {
    setup: function( _, ns, handle ){
        this.addEventListener("wheel", handle, { passive: false });
    }
};
jQuery.event.special.mousewheel = {
    setup: function( _, ns, handle ){
        this.addEventListener("mousewheel", handle, { passive: false });
    }
};
$.fn.animateTransform = function(/* [start,] end [, duration] [, callback] */){
  var start = null, end = null, duration = 400, callback = function(){};
  for(var i=0; i<arguments.length; i++){
    if(typeof(arguments[i]) == "string"){
      if(!start) start = arguments[i];
      else end = arguments[i];
    } else if(typeof(arguments[i]) == "number"){
      duration = arguments[i];
    } else if(typeof(arguments[i]) == "function"){
      callback = arguments[i];
    }
  }
  if(start && !end){
    end = start;
    start = null;
  }
  if(!end) return;
  if(start){
    this.css("transform", start);
  }
  if(duration < 16) duration = 16;
  var transitionB4 = this.css("transition");
  this.css("transition", "transform " + duration + "ms");
  this.css("transform", end);
  var $el = this;
  setTimeout(function(){
    $el.css("transition", transitionB4 || "");
    $el.css("transform", end);
    setTimeout(function(){ callback(); }, 200);
  }, duration);
};

//
var Gtmp = {};
    Gtmp['cache'] = {};
    Gtmp['pop_timer'] = true;
    Gtmp['ShowInScreen'] = {};
    Gtmp['barG'] = {};
var s_pc = Math.floor(Date.now() / 1000);
var s_fix = s_server - s_pc;
var ChangeDayTime = 2147483647;
var ChangeWeekTime = 2147483647;
var CityUtc = {};
var CityNow = '';
var Box_Left_Now = '';
var Box_Right_Show = 0;
var Box_Left_Show = 0;
var Box_Left2_Show = 0;
var Box_Tool_Show = 0;
var Box_Search_Show = 0;
var Box_Context_Show = 0;
var Box_TodoList_Show = 0;
var Box_Report_Show = 0;
var lang_set = {'kr':0,'cht':1,'chs':2,'jp':3,'eng':4};
var langNow = 'cht';
var langG = 1;
if( typeof lang_js === 'undefined' ) var lang_js = {};
var skill_chars = {};
var lang_chars = {};
var wood_citys = {};
//  kr,cht,chs,jp,eng
function lang( id, lclass='', nospan='', def=null ) {
    if( !id ) return '';
    if( typeof lang_js[langG] === 'undefined' ) lang_js[langG] = {};
    //
    var res = ( def === null ) ? id : def;
    if( typeof lang_js[langG][id] !== 'undefined' && lang_js[langG][id] != '' ) {
        res = lang_js[langG][id];
    }else if( typeof lang_js[1][id] !== 'undefined' && lang_js[1][id] != '' ) {
        res = lang_js[1][id];
    }
    if( nospan != '' ) return res;
    return '<span class="lang '+ lclass +'" lang="'+ id +'" title="' + res + '">' + res + '</span>';
}
function langN( id, def=null ) { return lang( id, '', 'nospan', def ); }
function langAry( ids, lclass='', nospan='', def=null ) {
    var langs = '';
    $.each( ids, function(i,id){ langs+= lang( id, lclass, nospan, def ) })
    return langs;
}
function lang_select( lang_new ) {
    langNow = lang_new;
    langG = lang_set[lang_new];
    //
    if( typeof lang_js[langG] === 'undefined' || typeof lang_js[langG] === 'object' ) json_get( 'lang_'+langG, function(){ lang_reset() } );
    //
    url_hash( 'lang', lang_new );
    //
    $('#lang_config a').removeClass('selected');
    $('#lang_config a.'+lang_new).addClass('selected');
    //
    cache('lang', lang_new);
    if( typeof lang_js[langG] !== 'undefined' ) lang_reset();
}
function lang_reset() {
    $('.lang').each(function(){
        $(this).html( langN( $(this).attr('lang') ) );
        //
        $('#notice').hide();
        if( langN('menu150') !== '-' ) $('#notice').html( langN('menu150') ).show();
    });
}
function CheckLang() {
    var Ulang = ( window.navigator.userLanguage || window.navigator.language ).toLowerCase();
    if( Ulang.indexOf('zh') === 0 ) {
        if( Ulang.indexOf('zh-cn') !== -1 ) return 'chs';
        return 'cht';
    }else if( Ulang.indexOf('ja') === 0 ) {
        return 'jp';
    }else if( Ulang.indexOf('ko') === 0 ) {
        return 'kr';
    }else{
        return 'eng';
    }
}
//
function list2lang( list, lclass='', dot='、' ) {
    if( typeof list === 'undefined' ) return '';
    var res = '';
    $.each( list, function( i, n ) {
        res += ( res == '' ? '' : dot ) + lang( n, lclass );
    });
    return res;
}

//wind_1800_1500
function ShowInScreen( name, selecter ) {
    var wh = $(window).height();
    var ww = $(window).width();
    //
    Gtmp['ShowInScreen'][name] = [];
    $(selecter).each(function(){
        var Sheight = $(this).height();
        var Swidth = $(this).width();
        var Stop = $(this).offset().top;
        var Sleft = $(this).offset().left;
        var Sbottom = Stop  + Sheight;
        var Sright  = Sleft + Swidth;
        if( Sbottom < 0 ||  Sright < 0 ||  Stop > wh ||  Sleft > ww ) return;
        if( name == 'wind' ) {
            var id = $(this).attr('id');
            if( typeof id === 'undefined' ) return;
            Gtmp['ShowInScreen'][name].push( id );
        }else{
            Gtmp['ShowInScreen'][name].push( $(this) );
        }
    });
    Gtmp['ShowInScreen'][name].push('end');
    return true;
}
//
function ShowTime() {
    //  流行時間到數
    if( Gtmp['pop_timer'] ) pop_timer();
    //  備忘錄倒數
    $.each( $('.time_over'), function(){
        var tt = $(this).data('type');
        var th = $(this).data('th');
        var tm = $(this).data('tm');
        var ts = $(this).data('ts');
        if( th < nHour ) th += 24;
        var tSec = (th-nHour)*3600 - (nMin-tm)*60 - (nSec-ts);
        if( tSec < 0 ) tSec = 0;
        if( tt == 'pop' && tSec == 0 ) show_todo_list();
        $(this).html( em_time( tSec, '⏳' ) );
    })
    //  地圖縮小低於0.5則不更新
    if( transform.scale <= 0.5 ) return false;
    //
    if( typeof Gtmp['ShowInScreen']['timer'] === 'undefined' ) ShowInScreen( 'timer', '.timer' );
    $.each( Gtmp['ShowInScreen']['timer'], function( i, v ){
        if( v == 'end' ) return false;
        v.html( UtcTime( v.data('utc'), v.data('tool'), v.data('check'), v.parent().data('cityid') ) );
    })
    //
    if( typeof Gtmp['ShowInScreen']['shop_timer'] === 'undefined' ) ShowInScreen( 'shop_timer', '.shop_timer' );
    $.each( Gtmp['ShowInScreen']['shop_timer'], function( i, v ){
        if( v == 'end' ) return false;
        var t = $(this).data('time');
        if( t <= 0 ) return;
        v.html( ShopTime( t ) );
    })
}
//  
function UtcTime( utc, tool_o, check, cityid ){
    var s = now + s_fix + utc;
    var s_day = s % 720;
    var city_H = Math.floor( s_day / 30 );
    var city_M = Math.round( s_day - ( city_H * 30 ) ) * 2;
    //
    var bclass = 'close';
    if( tool_o != 'n' && check_tool( cityid ) == '0' ) {
        if( tool_o == '24h' ) {
            bclass = 'open';
        }else if( city_H >= tool_o || city_H < 4 ) {
            bclass = 'open';
        }else if( city_H == 4 || city_H == 5 ) {
            bclass = 'closing';
        }
    }
    if( check > 0 ) bclass = 'done';
    //
    return '<b class="' + bclass + '">' + add_zero( city_H ) + '<i>:</i>' + add_zero( city_M ) + '</b>';
}
//  shop_timer
function ShopTime( t ) {
    if( t <= 0 ) return '<b>00<i>:</i>00<em></em></b>';
    var s = now - t;
    var sd = s % 1800;
    var sd = 1800 - sd;
    var sM = Math.floor( sd / 60 );
    var sS = Math.floor( sd % 60 );
    //  bclass
    var bclass = '';
    //
    return '<b class="' + bclass + '">' + add_zero( sM ) + '<i>:</i>' + add_zero( sS ) + '<em></em></b>';
}
//  前面補0
function add_zero( n ) {
    return n < 10 ? '0'+n : n;
}

//  city_timer
function city_timer( cityid, tool_o ) {
    if( typeof CityUtc[cityid] === 'undefined' ) return '';
    //
    var show_citytime = cache( 'show_citytime', null, {'def':'1'} ) == '1' ? '' : 'display: none;';
    return '<div class="btn timer" style="'+ show_citytime +'" data-utc="'+ CityUtc[cityid] +'" data-tool="'+ tool_o +'" data-check="'+ check_tool( cityid ) +'"></div>';
}

//  shop_time
function shop_time( cityid, t ) {
    var time;
    var key = 'shop_time.' + cityid;
    //  set t = time
    if( typeof t !== 'undefined' ) {
        time = cache( key, t );
        $('#box_shop_timer').data('time', time);
        return;
    }
    // get
    time = cache( key );
    return time;
}
function clear_shop_timer() {
    shop_time(CityNow,'0');
    $('#box_shop_timer').html('00:00');
    $('#'+CityNow+' .shop_timer').data('time','0');
    $('#'+CityNow+' .shop_timer').html('');
}

//  港口
function box_right( cityid ) {
    if( typeof cityid === 'undefined' ) return false;
    CityNow = cityid;
    city = json_city[cityid];
    if( typeof city === 'undefined' ) return false;
    url_hash( 't', cityid );
    $('.city.selected').removeClass('selected');
    $('#'+cityid).addClass('selected');
    //
    var Box_right_body = $('<div id="box_right_body" class="box_body main_scroll" />');

    //
    if( typeof city.open !== 'undefined' ) Box_right_body.append('<div class="not_open">'+ lang(city.open, 'translate') +'</div>');

    //  city_info
    var Box_city_info = $('<div id="city_info" class="box"></div>');
        var city_icon = $('#'+cityid+' .city_icon').html();
        if( city_icon !== '' ) {
            var city_info_h5 = $('<h5 class="city_icon"></h5>').html( city_icon );
            Box_city_info.append( city_info_h5 );
        }
    //
    Box_right_body.append( Box_city_info );

    //  
    var shop_time_save = $('<a id="shop_time_save" class="submit">'+lang('menu5')+'</a>').click(function(){
        var t = parseInt( $('#shop_time_m').val() )*60 + parseInt( $('#shop_time_s').val() );
        t = now - ( 1800 - t );
        $('#'+CityNow+' .shop_timer').data('time', t);
        shop_time( CityNow, t );
    });
    //  city_shop
    var Box_city_shop = $('<div id="city_shop" class="box"></div>');
        var city_shop_menu = $('<div class="h5_menu"></div>').html( 
                    $('<a>'+lang('menu6')+'</a>').click(function(){
                        $('#shop_time_m').val('30');
                        $('#shop_time_s').val('00');
                        shop_time_save.click();
                    })
                )
                
        var city_shop_h5 = $('<h5><img src="img/trade03.png">'+lang('menu1')+lang('menu2')+'</h5>');
        var city_shop_main = $('<div class="box_main"></div>');
            var Box_shop_timer = $('<div id="box_shop_timer" class="shop_timer"></div>').data('time', shop_time( cityid ) ).html('00:00');
            var Box_shop_time_set = $('<div class="shop_time_set"></div>')
                    .append('<input id="shop_time_m" type="text" value="29">')
                    .append( $('<input id="shop_time_s" type="text" value="50">').keyup(function(e){
                            var code = e.keyCode || e.which;
                            if (code == 13) shop_time_save.click();
                        }))
                    .append( shop_time_save )
                    .append( $('<a class="submit">'+lang('menu4')+'</a>').click(function(){ clear_shop_timer() }) )
            city_shop_main
                .append( Box_shop_timer )
                .append( Box_shop_time_set );
        //
        Box_city_shop
            .append( city_shop_menu )
            .append( city_shop_h5 )
            .append( city_shop_main );
    //
    Box_right_body.append( Box_city_shop );

    //  city_char
    var Box_city_char = $('<div id="city_char" class="box"></div>');
    var city_char_h5 = $('<h5 class="h5_btn" data-bid="city_char_main"><b class="hide"></b>1.'+lang('menu26')+'</h5>');
    var city_char_main = $('<ul id="city_char_main" class="box_main"><li>loading...</li></ul>');
    if( cache( 'box_hide.city_char_main' ) == '1' ) {
        city_char_h5.children('.hide').removeClass( 'hide' ).addClass( 'show' );
        city_char_main.hide();
    }
    //
    Box_city_char
        .append( city_char_h5 )
        .append( city_char_main )
    Box_right_body.append( Box_city_char );

    //  city_ship
    if( typeof city_shipitems[cityid] !== 'undefined' ) {
        var Box_city_ship = $('<div id="city_ship" class="box"></div>');
        var city_ship_h5 = $('<h5 class="h5_btn" data-bid="ship_main"><b class="hide"></b>2.'+lang('menu11')+'</h5>');
        //  解鎖條件
        var city_ship_main = $('<div id="ship_main" class="box_main"></div>')
                .append( config_checkbox( cityid, 'ship_inved', lang('menu27'),  [], function(res){
                    if( res == '1' ) return $('.ship_'+cityid).addClass('inved');
                    return $('.ship_'+cityid).removeClass('inved');
                 }));
        var ship_item = '';
        $.each( city_shipitems[cityid], function( itemid, arr ){
            if( typeof arr['week'] === 'undefined' ) arr['week'] = 1;
            ship_item = '<span class="name">' + lang( itemid, 'translate' ) + ' (' + arr['week'] + ')</span>';
            if( typeof arr['glv'] !== 'undefined' ) ship_item += '<span class="glv" >'+lang('menu29')+' ' + arr['glv'] + '</span>';
            if( typeof arr['inv'] !== 'undefined' ) ship_item += '<span class="inv" >'+lang('menu28')+' ' + arr['inv'] + ' '+lang('menu30')+'</span>';
            if( typeof arr['llv'] !== 'undefined' ) ship_item += '<span class="inv" >'+lang('menu45')+' Lv.' + arr['llv'] + '</span>';
            if( typeof arr['req'] !== 'undefined' ) ship_item += '<span class="req" >'+ lang( arr['req'] ) +'</span>';
            //
            city_ship_main.append('<div class="shipitem">' + ship_item + '</div>');
        });
        if( cache( 'box_hide.ship_main' ) == '1' ) {
            city_ship_h5.children('.hide').removeClass( 'hide' ).addClass( 'show' );
            city_ship_main.hide();
        }
        //
        Box_city_ship
            .append( city_ship_h5 )
            .append( city_ship_main )
        Box_right_body.append( Box_city_ship );
    }
    //  city_market
    var Box_city_market = $('<div id="city_market" class="box"></div>');
    if( typeof city.ss !== 'undefined' ) {
        var city_mon_ss = seasons[city.ss][gMon];
        var city_market_h5 = $('<h5 class="h5_btn" data-bid="market_main"><b class="hide"></b>3.'+lang('menu1')+'</h5>')
                .append('<em class="ss_now">'+ emoji_ss[city_mon_ss] +' '+ lang( 'seasons'+city_mon_ss ) +' ( '+ gMon +'月 )</em>')
        var city_market_main = $('<div id="market_main" class="ss'+ city_mon_ss +'"></div>');
            //  trade_zone
            var city_trade_zone = $('<div class="city_trade_zone"></div>')
                    .append( '<span class="sp50"><a class="go" onclick="pzone_go(\'zone_'+city.pz+'\');event.cancelBubble=true;"><img src="/img/common/pop.png?v=1">' + lang('zone_'+city.pz) + '</a><span>' )
                    .append( '<span class="sp50"><a class="go" onclick="tzone_go(\'zone_'+city.tz+'\');event.cancelBubble=true;"><img src="/img/common/citygo2.png">' + lang('zone_'+city.tz) + ' ' + lang('menu135') + '</a><span>' )
            city_market_main
                .append( city_trade_zone )
            //  Lang
            var city_trade_lang = $('<div class="city_trade_lang"></div>')
            $.each( city.l, function( i, la ){
                city_trade_lang
                    .append( '<span class="sp50"><a class="go" onclick="box_left_char( function(){select_lang(\''+la+'\')} );event.cancelBubble=true;"><b class="emoji">🗯️</b>' + lang( la ) + '</a><span>' )
            } )
            city_market_main
                .append( city_trade_lang )
            //
            var ss_th = '';
            var ss_td = '';
            var ss_in_city = {};
            $.each( seasons[city.ss], function( i, m ){
                if( i == 0 ) return;
                var thisMon = i == gMon ? 'thisMon' : '';
                ss_th += '<th data-ss="ss'+m+'" data-mon="'+i+'" class="ssmon '+ thisMon +' ss'+m+' mon'+i+'">'+ lang( 'mon'+i ) +'</th>';
                ss_td += '<td data-ss="ss'+m+'" data-mon="'+i+'" class="ssmon '+ thisMon +' ss'+m+' mon'+i+'">'+ emoji_ss[m] +'</td>';
                ss_in_city['s'+m] = true;
            } )
            var city_seasons = '<table class="seasons"><tr>'+ ss_th +'</tr><tr>'+ ss_td +'</tr></table></li>';
            city_market_main
                .append( city_seasons )
                .find('th,td').click(function(){
                    var ss = $(this).data('ss');
                    var mon = $(this).data('mon');
                    city_market_main.attr( 'class', ss );
                    $('.seasons .thisMon').removeClass( 'thisMon' );
                    $('.seasons .mon'+mon).addClass( 'thisMon' );
                });
            //
            var trades_ul = $('<ul class="trades_ul"></ul>');
            $.each( city_trades[cityid], function( i, tid ){
                var li_class = '';
                var t = trades[tid];
                var trade_img = $('<div class="img"><img src="'+ img_src( 'trade', tid ) +'" /></div>');
                    if( t.r == '5' ) trade_img.append('<em>'+lang('menu67')+'</em>');
                var trade_name = $('<div class="name">'+ lang( tid ) + lang( 'tradetype'+t.t, 'tt' ) +'</div>');
                var trade_pm  = $('<div class="pm"></div>');
                if( typeof tradetype_pm[t.t] !== 'undefined' ) {
                    $.each( ['p','m'], function(i,p_m){
                        if( typeof tradetype_pm[t.t][p_m] === 'object' ) {
                            var tmp = '';
                            var pm_class = p_m == 'p' ? 'plus ' : 'minus ';
                            $.each( tradetype_pm[t.t][p_m], function( i, pm ){
                                if( ss_in_city[pm] ) {
                                    tmp += lang( 'season'+pm, '', '1' );
                                    pm_class += pm +' ';
                                    li_class += ' '+p_m+'_' + pm;
                                }
                            })
                            if( tmp != '' ) trade_pm.append( $('<span class="'+ pm_class +'">'+(p_m=='p'?'▲':'▼')+'</span>').append( tmp ) )
                        }
                    })
                }
                var trade_req = $('<div class="box_req"></div>');
                //if( typeof tarr['glv'] !== 'undefined' ) trade_req.append('<span class="req glv">'+ lang('menu29')+' Lv' + tarr['glv'] + '</span>');
                //if( typeof tarr['tlv'] !== 'undefined' ) trade_req.append('<span class="req tlv">'+ lang('menu41')+' Lv' + tarr['tlv'] + '</span>');
                //if( typeof tarr['klv'] !== 'undefined' ) trade_req.append('<span class="req klv">'+ lang('menu42')+' Lv' + tarr['klv'] + '</span>');
                //if( typeof tarr['job'] !== 'undefined' ) trade_req.append('<span class="req job">'+ lang('menu66')+' ' + lang( tarr['job'] ) + '</span>');
                //if( typeof tarr['inv'] !== 'undefined' ) trade_req.append('<span class="req inv">'+ lang('menu28')+' ' + tarr['inv'] + ' '+lang('menu30') +'</span>');
                //  獨佔
                if( t['exc'] === 'guild') trade_req.append('<span class="req exc '+ t['exc'] +'">'+ lang('menu146')+'</span>');
                if( t['exc'] === 'zone' ) trade_req.append('<span class="req exc '+ t['exc'] +'">'+ lang('menu147')+'</span>');
                //  trades.req
                if( typeof t.req !== 'undefined' && typeof t.req[cityid] !== 'undefined' ) {
                    var tr = t.req[cityid];
                    if( typeof tr.mem !== 'undefined' ) trade_req.append('<span class="req glv">'            + lang( tr.mem )  + ' Lv.'+ tr.mlv + '</span>');
                    if( typeof tr.job !== 'undefined' ) trade_req.append('<span class="req job">'            + lang( tr.job )  + ( tr.job_n > 1 ? ' ( '+ tr.job_n +' )' : '' ) + '</span>');
                    if( typeof tr.boss!== 'undefined' ) trade_req.append('<span class="req boss">'           + lang( tr.boss ) + '</span>');
                    if( typeof tr.inv !== 'undefined' ) trade_req.append('<span class="req inv">'            + lang('menu28') + ' ' + lang( tr.inv )  + ' ' + lang('menu30') +'</span>');
                    if( typeof tr.exc !== 'undefined' ) trade_req.append('<span class="req exc '+tr.excc+'">'+ lang( tr.exc )  + '</span>');
                    if( typeof tr.note!== 'undefined' ) trade_req.append('<span class="req note">'           + lang( tr.note ) + '</span>');
                }

                //
                if( typeof t['nlp'] !== 'undefined' ) {
                    trade_pm = $('<div class="pm"></div>');
                    li_class = '';
                }

                var trades_li = $('<li class="show_light_box light_trade '+ tid +' grade_'+ t.r + li_class +'" data-tid="'+ tid +'"></li>')
                    .append( trade_img )
                    .append( trade_name )
                    .append( trade_pm )
                    .append( trade_req )
                    .click( function(){ trade_info_show( tid ) } )
                //
                trades_ul.append( trades_li );
            })
            city_market_main.append( trades_ul );

        //
        if( cache( 'box_hide.market_main' ) == '1' ) {
            city_market_h5.children('.hide').removeClass( 'hide' ).addClass( 'show' );
            city_market_main.hide();
        }
        //
        Box_city_market
            .append( city_market_h5 )
            .append( city_market_main )
        Box_right_body.append( Box_city_market );
    }

    //  bar_qa
    if( typeof city.b !== 'undefined' && city.b !== 'N' ) {
        var bar_qa_h5 = $('<h5 class="h5_btn" data-bid="bar_main"><b class="hide"></b>4.'+lang('menu7')+' '+lang('menu8')+'</h5>');
        //
        var bar_main = $('<div id="bar_main" class="box"></div>');
            //
            var girl_info = $('<div class="bar_info"></div>')
                .append( '<span class="thumb grade_5"><img src="/img/girl/uwo_'+ city.bg +'.png" /></span>' )
                .append( '<span class="gname">'+ lang( city.bg, 'translate' ) + ( city.bup == 1 ? '　('+lang('menu213')+')' : '' ) +'</span>' )
                .append( '<span class="gtype">'+ lang('menu31')+'：<b>'+ city.b.toUpperCase() +'</b></span>' )
                .append( '<span class="disfav" >'+ lang('menu32')+'：<b>'+ lang(city.b1) +'</b>, <b>'+ lang(city.b2) +'</b></span>' )
            bar_main.append(girl_info)

            //
            var quest_ul = $('<ul id="bq_main" class="box_main box_quest"></ul>');
                $.each( city.bq, function(i,qid){
                    var q = quests[qid];
                    var qli = $('<li class="show_light_box light_quest '+qid+'" data-qid="'+qid+'"><span class="type '+ q.class +'"></span><em class="have '+have( qid )+'"></em>'+ lang(qid,'qname') +'</li>')
                        .click( function(){ quest_info_show( qid ); })
                    quest_ul.append( qli );
                } )
            bar_main
                .append( '<h6>'+ lang('menu123') +'</h6>' )
                .append( quest_ul );

            //
            var bar_qa_ul = $('<ul class="box_main qa"></ul>');
                var qa_list = '';
                for( i = 1 ; i < 11 ; i++ ){
                    qa_list += '<li><span class="q">'+ lang('bar_q'+i) +'</span><b class="a">'+ lang('bar_'+city.b+i) +'</b></li>';
                }
                bar_qa_ul.html( qa_list );
            bar_main
                .append( '<h6>Q&A</h6>' )
                .append( bar_qa_ul );
        //
        if( cache( 'box_hide.bar_main' ) == '1' ) {
            bar_qa_h5.children('.hide').removeClass( 'hide' ).addClass( 'show' );
            bar_main.hide();
        }
        //
        var Box_bar_qa = $('<div id="city_bar" class="box"></div>')
            .append( bar_qa_h5 )
            .append( bar_main )
        Box_right_body.append( Box_bar_qa );
    }

    //  city quest
    if( typeof city.uq !== 'undefined' || typeof city.dq !== 'undefined' ) {
        var Box_quest = $('<div id="city_quest" class="box"></div>');
        var quest_h5 = $('<h5 class="h5_btn" data-bid="quest_main"><b class="hide"></b>5.'+ lang('menu102') +' '+ lang('menu72') +'</h5>');
        var quest_ul = $('<ul id="quest_main" class="box_main box_quest"></ul>');
        if( typeof city.uq !== 'undefined' ) {
            quest_ul.append( '<li><h6>'+ lang('menu106') +'</h6></li>' );
            $.each( city.uq, function(i,qid){
                var q = quests[qid];
                var qli = $('<li class="show_light_box light_quest '+qid+'" data-qid="'+qid+'"><span class="qlv">Lv.'+ q.lvg +'</span><span class="type '+ q.class +'"></span><em class="have '+have( qid )+'"></em>'+ lang(qid,'qname') +'</li>')
                    .click( function(){ quest_info_show( qid ); })
                quest_ul.append( qli );
            } )
        }
        if( typeof city.dq !== 'undefined' ) {
            quest_ul.append( '<li><h6>'+ lang('menu127') +'</h6></li>' );
            $.each( city.dq, function(i,qid){
                var q = quests[qid];
                var qli = $('<li class="show_light_box light_quest '+qid+'" data-qid="'+qid+'"><span class="type '+ q.class +'"></span></em></li>')
                    .append('<span class="qname">'+ langN('menu128') +' <b class="trade">'+ langN(q.did) +'</b><span class="emoji">🚤</span><b>'+ langN(q.s[1].go.cityid) +'</b></span>')
                    .append( q.p=='1' ? '<img class="good" src="/img/common/good3.png" />' : '' )
                    .click( function(){ quest_info_show( qid ); })
                quest_ul.append( qli );
            } )
        }
        if( cache( 'box_hide.quest_main' ) == '1' ) {
            quest_h5.children('.hide').removeClass( 'hide' ).addClass( 'show' );
            quest_ul.hide();
        }
        //
        Box_quest
            .append( quest_h5 )
            .append( quest_ul )
        Box_right_body.append( Box_quest );
    }

    //  city_smuggle
    if( typeof city.sm !== 'undefined' ) {
        var Box_city_smuggle = $('<div id="city_smuggle" class="box"></div>');
        var smuggle_h5  = $('<h5 class="h5_btn" data-bid="city_smuggle_main"><b class="hide"></b>6.'+ lang('menu219', 'translate') +'</h5>');
        var smuggle_main= $('<div id="city_smuggle_main" class="box_main"></div>');
        //
        smuggle_main
            .append('<ul class="city_map_note"><li><b class="emoji">🟡</b>'+ lang('menu221', 'translate') +'</li><li><b class="emoji">🔴</b>'+ lang('menu220', 'translate') +'</li></ul>')
            .append('<img class="city_map" src="/img/map/'+cityid+'.png" />')

        //
        if( cache( 'box_hide.city_smuggle_main' ) == '1' ) {
            smuggle_h5.children('.hide').removeClass( 'hide' ).addClass( 'show' );
            smuggle_main.hide();
        }
        //
        Box_city_smuggle
            .append( smuggle_h5 )
            .append( smuggle_main )
        Box_right_body.append( Box_city_smuggle );
    }


    //  city config
    var Box_city_config = $('<div id="city_config" class="box"></div>');
    var city_config_h5 = $('<h5 class="h5_btn" data-bid="city_config_main"><b class="hide"></b>7.'+ lang('menu12') +'</h5>');
    var Box_city_main = $('<div id="city_config_main" class="box_main"></div>');
    var config_li = $('<div class="config_list"></div>');
        var config_li_count = 0;
        if( city.o != 'n' ) {
            config_li_count++;
            config_li.append( config_checkbox( cityid, 'tool_not_open',  lang('menu24'),       [], function(res){
                if( res == '1' ) return $('.tool_'+cityid).addClass('not_open');
                return $('.tool_'+cityid).removeClass('not_open');
            } ));
        }
        if( typeof city.b !== 'undefined' ) {
            config_li_count++;
            config_li.append( config_checkbox( cityid, 'hide_icon_bar',  lang('menu25')+': '+lang('menu7'),       [], function(res){
                if( res == '1' ) return $('.bar_'+cityid).addClass('hide_icon');
                return $('.bar_'+cityid).removeClass('hide_icon');
            } ));
        }
        if( typeof city_shipitems[cityid] !== 'undefined' ) {
            config_li_count++;
            config_li.append( config_checkbox( cityid, 'hide_icon_ship', lang('menu25')+': '+lang('menu11'),     [], function(res){
                if( res == '1' ) return $('.ship_'+cityid).addClass('hide_icon');
                return $('.ship_'+cityid).removeClass('hide_icon');
            } ));
        }
    if( cache( 'box_hide.city_config_main' ) == '1' ) {
        city_config_h5.children('.hide').removeClass( 'hide' ).addClass( 'show' );
        Box_city_main.hide();
    }
    
    Box_city_main
        .append( config_li )
    Box_city_config
        .append( city_config_h5 )
        .append( Box_city_main )
    if( config_li_count > 0 ) Box_right_body.append( Box_city_config );

    var comments_hide = cache( 'box_hide.city_comments_main' );
    Box_right_body
        .append('<h5 class="h5_btn" data-bid="city_comments_main"><b class="'+(comments_hide=='1'?'show':'hide')+'"></b>'+ lang('menu57') +'：'+ lang( cityid ) +'</h5>')
        .append('<div id="city_comments_main" style="'+(comments_hide=='1'?'display:none':'')+'"><div class="fb-comments" data-href="https://voyage.tw/#t='+cityid+'" data-numposts="10" data-width="320" data-order-by="reverse_time"></div></div>')

    //  TestMode
    if( TestMode ) {
        var Box_TestMode = $('<div id="test_mode" class="box"></div>');
        var test_mode_h5 = $('<h5>測試用</h5>');
        var TestMode_cityid = $('<input class="box_main" onclick="this.select();document.execCommand(\'copy\');" value="'+ cityid +'"/>');
        var TestMode_main = $('<input class="box_main" onclick="this.select();document.execCommand(\'copy\');" value="'+ parseInt( $('#'+cityid).css('left') ) + '﹐' + parseInt( $('#'+cityid).css('top') ) +'"/>');
        var sd = shop_time( cityid ) % 1800;
        var TestMode_main2 = $('<div class="box_main"></div>')
            .append('<input onclick="this.select();document.execCommand(\'copy\');" value="'+ add_zero( Math.floor( sd / 60 ) ) +':'+ add_zero( Math.floor( sd % 60 ) ) +'" />')
        //
        Box_TestMode
            .append( test_mode_h5 )
            .append( TestMode_cityid )
            .append( TestMode_main )
            .append( TestMode_main2 )
        Box_right_body.append( Box_TestMode );
    }
    //
    Box_right_body
        .append('<div style="height:400px"></div>')
    //
    var Box_right = $('#box_right').html('');
        Box_right
            .append( city_timer( cityid ) )
            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click(function(){ right_box_close() }) )
            .append( '<h3 id="box_title">'+ lang( cityid, 'translate' ) +'</h3>' )
            .append( Box_right_body )
    
    //  設定箭頭 
    arrow_there( city.x, city.y, $('#'+cityid).width() );
    //$('#city_there').css({ 'left': city.x+'px', 'top': city.y+'px' }).width( $('#'+cityid).width() ).show();
    //
    Box_Right_Show = 1;
    $('#babala').animate({ 'right': 250 }, 500 ).addClass('have_right');
    $('#box_right').animate({ right: -300, opacity: 0.5 }, 200 ).animate({ right: 0, opacity: 1 }, 400 );
    json_get( 'char', function(){ load_city_char(); } );
    $('#box_right .main_scroll').not('.scroll-wrapper').scrollbar();
    //
    if( comments_hide == '0' ) fb_load();
}
//
function city_set() {
    if( typeof Gtmp['city2id'] === 'undefined' ) Gtmp['city2id'] = {};
    //
    var MapCitys = '';
    $.each(json_city, function(cityid, city) {
        if( !cityid ) return;
        //  Gtmp
        Gtmp['city2id'][lang( cityid, '' ,'1' )] = cityid;
        //
        var city_time = '';
        if( city.u != 'n' && cache( 'show_citytime', null, {'def':'1'} ) == '1' ) {
            CityUtc[cityid] = city.u * -30;
            city_time = city_timer( cityid, city.o );        //  timer
        }
        var city_icon = '';
        var icon = 1;
        //  tool
        if( city.o != 'n' ) {
            var tool_checked = check_tool( cityid ) > 0 ? 'checked' : '';
            var tool_not_open = city_config( cityid, 'tool_not_open' ) == '1' ? 'not_open' : '';
            var show_tool = cache( 'show_tool_all', null, {'def':'1'} ) == '1' ? '' : 'display: none;';
            city_icon += '<span class="icon'+(icon++)+' have_tool tool_'+cityid+' '+tool_checked+' '+tool_not_open+'" style="'+show_tool+'" data-cityid="'+cityid+'"></span>';
        }
        //  bar
        if( typeof city.b !== 'undefined' ) {
            Gtmp['barG'][city.bg] = cityid;
            var bar_checked = check_bar( cityid ) > 0 ? 'checked' : '';
            var hide_icon = city_config( cityid, 'hide_icon_bar' ) == '1' ? 'hide_icon' : '';
            var show_bar = cache( 'show_bar_all', null, {'def':'1'} ) == '1' ? '' : 'display: none;';
            city_icon += '<span class="icon'+(icon++)+' have_bar bar_'+cityid+' '+bar_checked+' '+hide_icon+'" style="'+show_bar+'" data-cityid="'+cityid+'" data-bar="'+city.b+'"></span>';
        }
        //  ship wood
        if( typeof city_shipitems[cityid] !== 'undefined' ) {
            var ship_checked = check_wood( cityid ) > 0 ? 'checked' : '';
            $.each( city_shipitems[cityid], function( itemid, arr ){
                if( typeof wood_citys[itemid] === 'undefined' ) wood_citys[itemid] = {};
                if( typeof wood_citys[itemid][cityid] === 'undefined' ) wood_citys[itemid][cityid] = {};
                wood_citys[itemid][cityid] = ship_checked;
            });

            var hide_icon = city_config( cityid, 'hide_icon_ship' ) == '1' ? 'hide_icon' : '';
            var show_wood = cache( 'show_wood_all', null, {'def':'1'} ) == '1' ? '' : 'display: none;';
            city_icon += '<span class="icon'+(icon++)+' have_wood ship_'+cityid+' '+ship_checked+' '+hide_icon+'"" style="'+show_wood+'" data-cityid="'+cityid+'"></span>';
        }
        //  belief
        if( typeof city.be !== 'undefined' ) {
            var show_be = cache( 'show_be_all', null, {'def':'1'} ) == '1' ? '' : 'display: none;';
            city_icon += '<span class="icon'+(icon++)+' have_be emoji" title="'+langN(city.be)+'" data-l="'+city.be+'" style="'+show_be+'">'+ belief_icon[city.be] +'</span>';
        }
        //  smuggle
        if( typeof city.sm !== 'undefined' ) {
            var show_sm = cache( 'show_sm_all', null, {'def':'1'} ) == '1' ? '' : 'display: none;';
            city_icon += '<span class="icon'+(icon++)+' have_sm emoji be" title="'+langN('menu219')+'" data-l="menu219" style="'+show_sm+';">🦸🏿‍♂️</span>';
        }
        //
        if( city_icon !== '' ) city_icon += '<div style="clear: both;"></div>';
        //  city
        MapCitys += '<div id="'+cityid+'" data-cityid="'+cityid+'" class="city" style="left: '+city.x+'px;top: '+city.y+'px;">'
                        +'<div class="city_icon">' + city_icon + '</div>'
                        +'<div class="btn icon"><img src="img/town'+city.s+'.png" style="width: 20px;"></div>'
                        +city_time
                        +'<div class="btn map_shop_timer shop_timer" data-time="' + shop_time( cityid ) + '"></div>'
                        +'<div class="btn name">'+ lang( cityid ) +'</div>'
                    +'</div>';
    });
    $('#city').html( MapCitys );
}
//  check 是否逛過黑店  up===true
function check_tool( cityid, up ) {
    var key = 'check_tool.' + cityid;
    var res = cache( key );
    if( res < ChangeDayTime ) res = '0';    // 換日
    if( up !== true ) return res;
    // 更新
    return cache( key, ( res > 0 ? 0 : now ) );
}
//  check 是否逛過酒館  up===true
function check_bar( cityid, up ) {
    var key = 'check_bar.' + cityid;
    var res = cache( key );
    if( res < ChangeDayTime ) res = '0';    // 換日
    if( up !== true ) return res;
    // 更新
    return cache( key, ( res > 0 ? 0 : now ) );
}
//  check 買過船材  up===true / 每週
function check_wood( cityid, up ) {
    var key = 'check_wood.' + cityid;
    var res = cache( key );
    if( res < ChangeWeekTime ) res = '0';    // 換周
    if( up !== true ) return res;
    // 更新
    return cache( key, ( res > 0 ? 0 : now ) );
}
//  city_config
function city_config( cityid, k, v ) {
    var key = 'city.' + cityid + '.' + k;
    return cache( key, v );
}

//  
function config_checkbox( cityid, name, txt, arr, callback ) {
    var id = cityid + '_' + name;
    var res = city_config( cityid, name );
    var checkbox = $('<input type="checkbox" id="'+id+'" name="'+id+'"/>')
                    .change(function() {
                        res = city_config( cityid, name, ( this.checked ? '1' : '0') );
                        if( typeof callback == 'function' ) callback(res);
                    })
                    .prop( 'checked', ( res == '1' ? true : false ) );
    return $('<label class="ship_inved" />').attr( 'for', id ).html( checkbox ).append( txt );
}

//
//  cache
//  {'def':'0'}
function cache( key, value = null , arr = {'def':'0'} ) {
    //  read
    if( value === null ) {
        if( typeof Gtmp['cache'][key] !== 'undefined' ) return Gtmp['cache'][key];
        var res = $.localStorage( key );
        if( typeof res === 'undefined' ) {
            if( typeof arr['def'] === 'undefined' ) arr['def'] = '0';
            Gtmp['cache'][key] = arr['def']; // cache
            res = arr['def'];
        }
        if( res === 'true' ) res = true;
        if( res === 'false' ) res = false;
        return res;
    }
    //  write
    Gtmp['cache'][key] = value; // cache
    return $.localStorage( key, value );
}
function cacheJ( key, value = null , arr = {'def':'{}'} ) {
    if( value !== null ) value = JSON.stringify( value );
    var res = JSON.parse( cache( key, value , arr ) );
    if( typeof res !== 'object' ) res = {};
    return res;
}
function cache_kv( key, k = null, v = null ) {
    var res = cacheJ( key );
    if( k === null ) return res;
    if( v === null ) return res[k];
    res[k] = v;
    if( v === 'del' ) delete res[k];
    return cacheJ( key, res );
}
//  char
function char( charid, k = null, v = null ) {
    if( v != null ) cache_kv( charid, k, v ); // 寫入
    $.each( cache_kv( charid ), function( k, v ) { json_char[charid][k] = v; } )
    //
    if( typeof json_char[charid]['up'] === 'undefined' ) json_char[charid]['up'] = '0';
    //
    if( k === null ) return json_char[charid];
    return json_char[charid][k];
}

//  計算換日 23:00=UTC 15點
function set_change_time() {
    //              utc 0點 -9小時=台灣昨晚23點=韓國0點
    ChangeDayTime = uSec0 - ( 9*3600 );
    // 換週         回到 uDay天 前
    ChangeWeekTime = ChangeDayTime - ( (uDay+6)%7 )*86400;
    if( uHour >= 15 ) ChangeDayTime += 86400;
    if( uHour >= 15 && uDay == 0 ) ChangeWeekTime += 7*86400;
}
// time 转 2020-xx-xx xx:xx:xx
function timeStamp2String( time = '' ) {
    var d = nDate;
    if( time ) d.setTime( time*1000 );
    return d.toLocaleString();
}

//  map
var MAX_WIDTH = 3440;
var MAX_HEIGHT = 1440;
var MIN_WIDTH = 400;
var MIN_HEIGHT = 300;
var SCALES = [0.2, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
var EDGE = $(window).height();
var EDGE_W = $(window).width();
if( EDGE_W > 1900 ) SCALES = [0.2, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
if( EDGE_W > 2500 ) SCALES = [0.26, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
if( EDGE_W > 3400 ) SCALES = [0.35, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
EDGE  += -300;
EDGE_W+= -300;

var BROWSER_BORDER_WIDTH = window.outerWidth - window.innerWidth;
var BROWSER_BORDER_HEIGHT = window.outerHeight - window.innerHeight;
var AVAIL_SCREEN = null;
var NATURAL_WIDTH = null;
var NATURAL_HEIGHT = null;

try {
    if (window.screen.availWidth > 500 && window.screen.availHeight > 500) {
        MAX_WIDTH = window.screen.availWidth;
        MAX_HEIGHT = window.screen.availHeight;
        AVAIL_SCREEN = true;
    }
} catch (r) {
    AVAIL_SCREEN = false;
}

var pageX = 0,
    pageY = 0,
    mousedown = null,
    prevScale = transform.scale,
    fadeOut = null;

var holder = $('#holder');
var wrap = $('#wrap');
var map = $('#map');

map[0].onload = function() {
    this.onload = this.onerror = null;
    if (NATURAL_WIDTH === null) {
        if (this.complete && this.naturalWidth > 0) {
            NATURAL_WIDTH = this.naturalWidth;
            NATURAL_HEIGHT = this.naturalHeight;
            wrap.css({
                'width': NATURAL_WIDTH,
                'height': NATURAL_HEIGHT,
            });
            $(window).on('resize', onresize);
            holder.on('mousemove', onmousemove)
                .on('DOMMouseScroll onwheel mousewheel onmousewheel wheel', onwheel)
                .on('mousedown', onmousedown)
                .on('mouseup', onmouseup)
                .on('dragstart', ondragstart)
                .on('touchmove', ontouchmove)
                .on('touchend', ontouchend)
                .on('touchcancel', ontouchcancel)
                .on('touchstart', ontouchstart);
            setTransform(false);
        }
    }
};

var onresize = function(e) {
    EDGE = $(window).height();
    EDGE_W = $(window).width();
    if (e && preventDisapper()) setTransform();
};

var onmousedown = function(e) {
    //
    if (e.which == 1 && !nowheel_over ) {
        holder.addClass('grabbing');
        startMove(e.pageX, e.pageY);
    }
};

var onmouseup = function(e) {
    if( Box_Context_Show == 1 && !context_over ) close_context();
    if (e.which == 1) {
        holder.removeClass('grabbing');
        mousedown = null;
        //
        url_hash();
        Gtmp['ShowInScreen'] = {}
    }
};

var onmousemove = function(e) {
    pageX = e.pageX;
    pageY = e.pageY;
    setMove();
};

var onwheel = function(e) {
    if( nowheel_over ) return;
    e.preventDefault();
    if( typeof e.originalEvent === 'undefined' ) return;
    var deltaY = 0;
    if (e.originalEvent.deltaY) {
        deltaY = e.originalEvent.deltaY;
    } else if (e.originalEvent.wheelDelta) {
        deltaY = -e.originalEvent.wheelDelta;
    }
    if ('pageX' in e.originalEvent && $.isNumeric(e.originalEvent.pageX)) {
        pageX = e.originalEvent.pageX;
        pageY = e.originalEvent.pageY;
    }
    if (deltaY < 0) {
        setScale(getNextScale(), true);
    } else if (deltaY > 0) {
        setScale(getPrevScale(), true);
    }
    return false;
};

var ondragstart = function(e) {
    e.preventDefault();
    return false;
};

var lastDistance = 0;
var isPinching = false;
var pinchThreshold = 30;
var pinchCallback = function(touchscale) {
    // 在此處處理縮放事件
    if (touchscale < 10) {
        setScale(getPrevScale(), false);
    } else {
        setScale(getNextScale(), false);
    }
};

var ontouchstart = function(e) {
    if( typeof e.originalEvent === 'undefined' ) return false;
    if( typeof e.originalEvent.touches === 'undefined' ) return false;
    // 觸點 兩點
    if (e.originalEvent.touches.length == 2) {
        // 計算兩點之間的距離
        var touch1 = e.originalEvent.touches[0];
        var touch2 = e.originalEvent.touches[1];
        var distance = Math.sqrt(Math.pow(touch2.pageX - touch1.pageX, 2) + Math.pow(touch2.pageY - touch1.pageY, 2));
        // 記錄上一次的距離和縮放狀態
        lastDistance = distance;
        isPinching = true;
    }else if (e.originalEvent.touches.length == 1) {
        startMove(e.originalEvent.touches[0].pageX, e.originalEvent.touches[0].pageY);
    } else {
        mousedown = null;
    }
};

var ontouchmove = function(e) {
    if( typeof e.originalEvent === 'undefined' ) return false;
    if( typeof e.originalEvent.touches === 'undefined' ) return false;
    if (e.originalEvent.touches.length == 1) {
        pageX = e.originalEvent.touches[0].pageX;
        pageY = e.originalEvent.touches[0].pageY;
        setMove();
    }
    // 如果不是在縮放狀態，則退出
    if( isPinching ) {
        // 計算兩點之間的距離
        var touch1 = e.originalEvent.touches[0];
        var touch2 = e.originalEvent.touches[1];
        var distance = Math.sqrt(Math.pow(touch2.pageX - touch1.pageX, 2) + Math.pow(touch2.pageY - touch1.pageY, 2));
        
        // 計算縮放比例
        var touchscale = distance / lastDistance;
        
        // 如果縮放比例大於閥值，則執行回撥函數
        if (Math.abs(touchscale - 1) > pinchThreshold / 100) {
          pinchCallback( parseInt( touchscale*10 ) );
          // 記錄新的距離
          lastDistance = distance;
        }
    }
    
};

var ontouchend = function(e) {
    // 重置縮放狀態和距離
    isPinching = false;
    lastDistance = 0;
    mousedown = null;
};

var ontouchcancel = function(e) {
    // 重置縮放狀態和距離
    isPinching = false;
    lastDistance = 0;
    mousedown = null;
};

var startMove = function(x, y) {
    if( nowheel_over ) return;
    mousedown = {
        left: transform.left,
        top: transform.top,
        x: x,
        y: y
    };
};

var setMove = function() {
    if( nowheel_over ) return;
    if (mousedown) {
        transform.left = mousedown.left - mousedown.x + pageX;
        transform.top = mousedown.top - mousedown.y + pageY;
        setTransform();
    }
};

var setScale = function(s, mousePoint) {
    mousedown = null;
    if ($.isNumeric(s)) {
        s = Math.min(Math.max(s, SCALES[0]), SCALES[SCALES.length - 1]);
        var x = pageX,
            y = pageY;
        if (!mousePoint) {
            x = holder.width() / 2;
            y = holder.height() / 2;
        }
        var ratio = s / transform.scale;
        transform.left = (transform.left - x) * ratio + x;
        transform.top = (transform.top - y) * ratio + y;
        transform.scale = s;
        setTransform();
    }
};

var getPrevScale = function(s) {
    if (typeof(s) === 'undefined') {
        s = transform.scale;
    } else if (!$.isNumeric(s)) {
        return transform.scale;
    }
    if (s > SCALES[0]) {
        for (var i = SCALES.length - 1; i >= 0; i--) {
            if (SCALES[i] < s) {
                return SCALES[i];
            }
        }
    }
    return SCALES[0];
};

var getNextScale = function(s) {
    if (typeof(s) === 'undefined') {
        s = transform.scale;
    } else if (!$.isNumeric(s)) {
        return transform.scale;
    }
    if (s < SCALES[SCALES.length - 1]) {
        for (var i = 0; i < SCALES.length; i++) {
            if (SCALES[i] > s) {
                return SCALES[i];
            }
        }
    }
    return SCALES[SCALES.length - 1];
};

var setTransform = function(withPreventDisapper) {
    if (withPreventDisapper !== false) preventDisapper();
    wrap.css({
        'transform': 'translate(' + transform.left + 'px, ' + transform.top + 'px) scale(' + transform.scale + ')',
        'background-size': (16 / transform.scale) + 'px'
    });
    if (prevScale !== transform.scale) {
        prevScale = transform.scale;
        if (fadeOut !== null) clearTimeout(fadeOut);
        //  loop
        loop_min_time   = loop_min_time10;
        if( transform.scale < 1   ) loop_min_time   = loop_min_time3;
        //  wind frame
        anime_min_time  = loop_min_time12;
        if( transform.scale < 0.75) anime_min_time  = loop_min_time6;
        if( transform.scale < 0.5 ) anime_min_time  = loop_min_time3;

        //
        var Class_scale = 4;
        if( transform.scale <= 3 ) Class_scale = '3';
        if( transform.scale <= 2.5 ) Class_scale = '25';
        if( transform.scale <= 2 ) Class_scale = '2';
        if( transform.scale <= 1.5 ) Class_scale = '15';
        if( transform.scale <= 1 ) Class_scale = '1';
        if( transform.scale <= 0.5 ) Class_scale = '05';
        if( transform.scale <= 0.35 ) Class_scale = '035';
        $('body').attr('class','scale'+Class_scale);
        //
        url_hash();
        Gtmp['ShowInScreen'] = {}
    }
};

var preventDisapper = function() {
    var w = holder.width(),
        h = holder.height(),
        left = transform.left,
        top = transform.top;
    if ((EDGE_W - transform.left) >= NATURAL_WIDTH * transform.scale) {
        transform.left = -NATURAL_WIDTH * transform.scale + EDGE_W;
    } else if ((transform.left + EDGE_W) >= w) {
        transform.left = w - EDGE_W;
    }
    if ((EDGE - transform.top) >= NATURAL_HEIGHT * transform.scale) {
        transform.top = -NATURAL_HEIGHT * transform.scale + EDGE;
    } else if ((transform.top + EDGE) >= h) {
        transform.top = h - EDGE;
    }
    return left != transform.left || top != transform.top;
};




// search button
var keying = false;
var keytmp = '';
$('.search_btn').click(function() {
    $('.search_input').toggleClass('active').focus();
    $(this).toggleClass('animate');
    $('.search_input').val('');
    $('#search_bg').hide();
    $('#search_out').html('');
    Box_Search_Show = 0;
});
$('#search_bg').click(function() {
    $('.search_btn').click();
});
$('#search_out').click(function(e) {
    e.stopPropagation();
});
$('.search_input').on('compositionstart', function(e) {
    keying = true;
}).on('compositionend', function(e) {
    keying = false;
    show_search_box(this, e.keyCode);
}).keyup(function(e) {
    if (!keying) show_search_box(this, e.keyCode);
})
//
function show_search_box(e, ek) {
    // ek = e.keyCode
    switch (ek) {
        case 38: //上
            var lis = $('#search_out a');
            var tli = lis.filter('.selected');
            lis.removeClass('selected');
            if (tli.length == 0 || tli.prev().length == 0) lis.filter(':last').addClass('selected');
            else {
                tli.prev().addClass('selected')
            };
            break;
        case 40: //下
            var lis = $('#search_out a');
            var tli = lis.filter('.selected');
            lis.removeClass('selected');
            if (tli.length == 0 || tli.next().length == 0) lis.filter(':first').addClass('selected');
            else {
                tli.next().addClass('selected')
            };
            break;
        case 13: //enter
            $('#search_out a.selected').click();
            break;
    }
    //
    var t = $('#search').val().toLowerCase().replace('|', '').trim();
    if (t == keytmp) return false;
    keytmp = t;
    if (t.length == 0) {
        $('#search_bg').hide();
        $('#search_out').html('');
        return false;
    }
    // search
    var res = uwo_search(t);
    if (res.length > 0) {
        Box_Search_Show = 1;
        $('#search_bg').show();
        $('#search_out').html(res);
        $('#search_out a').mouseover(function() {
            $('#search_out a').removeClass('selected');
            $(this).addClass('selected');
        });
    } else {
        $('#search_bg').hide();
    }
}

function uwo_search(t) {
    t = search_trim(t);
    if (t.length == 0) return '';
    var i = 0;
    var res_div = $('<div></div>');
    t = t.replace('，', ',').replace('﹐', ',');
    //  判斷是座標的話則前往
    if( /^[-+]?\d+(\.\d+)?, ?[-+]?(\d+)+(\.\d+)?$/.test( t ) ) {
        var ts = t.split(',');
        var tn = ts[0]*1;
        var te = ts[1]*1;
        var txy = null;
        if( tn <= 90 && tn >= -90 && te <= 180 && te >= -180 ) {
            txy = ne2xy( tn, te );
            if( !isNaN( txy.x ) && !isNaN( txy.y ) ) {
                var res = $('<a>'+lang('menu198')+' <b>'+ t +'</b></a>').click(function(){ xy_go( txy.x, txy.y ); $('.search_btn').click(); });
                res_div.append( res );
            }
        }else if( /^\d+, ?\d+$/.test( t ) ){
            var res = $('<a>'+lang('menu198')+' <b>'+ t +'</b></a>').click(function(){ xy_go( tn, te ); $('.search_btn').click(); });
            res_div.append( res );
        }
    }
    //
    $.each(lang_js[langG], function(k, v) {
        if ( typeof v === 'string' && v.indexOf(t) !== -1) {
            var res = $('<a k="'+k+'"></a>');
            var v2 = v.replace(t, '<b>' + t + '</b>');
            //
            if (k.indexOf('town') == 0) {
                res.append( langN('menu122') + ': ' + v2 ).click(function(){ city_go(k) });
            }else if(k.indexOf('discov') == 0) {
                if( k.indexOf('req') !== -1 ) return;
                res.append( langN('menu96') + ': ' + v2 ).click(function(){
                    box_left_load( 'discov', function(){
                        $('.search_btn').click();
                        $('#box_left').addClass('list_mode');
                        $('#box_discov li').hide();
                        $('#box_discov li.'+k).show();
                    } ); });
            }else if(k.indexOf('itemres') == 0) {
                res.append( langN('menu230') + ': ' + v2 ).click(function(){
                    box_left_load( 'discov', function(){
                        $('.search_btn').click();
                        left_menu_select( 'box_discov_zone' );
                        $('#box_left_menu b').hide();
                        $('#box_discov_zone li').hide();
                        $('#box_discov_zone li.'+k).show();
                        $('#box_discov_zone li [lang="'+k+'"]').css('color','red');
                    } ); });
            }else if(k.indexOf('chasc') == 0) {
                res.append( langN('menu8') + ': ' + v2 ).click(function(){ box_right(Gtmp['barG'][k]) });
            }else if(k.indexOf('cha') == 0) {
                res.append( langN('menu26') + ': ' + v2 ).click(function(){ char_info_show(k,'big'); $('.search_btn').click(); });
            }else if(k.indexOf('quest') == 0) {
                if( k.indexOf('step') !== -1 ) return;
                res.append( langN('menu72') + ': ' + v2 ).click(function(){ quest_info_show(k,'big'); $('.search_btn').click(); });
            }else if(k.indexOf('deliver') == 0) {
                res.append( langN('menu127') + ': ' + v2 ).click(function(){ quest_info_show(k,'big'); $('.search_btn').click(); });
            }else if(k.indexOf('skill') == 0) {
                if( k.indexOf('des') !== -1 ) return;
                res.append( langN('menu54') + ': ' + v2 ).click(function(){ select_skill(k); $('.search_btn').click(); });
            }else if(k.indexOf('trade') == 0) {
                if( k.indexOf('type') !== -1 ) return;
                res.append( langN('menu130') + ': ' + v2 ).click(function(){ trade_info_show(k); $('.search_btn').click(); });
            }else{
                return;
            }
            res_div.append( res );
            if (i++ >= 20) return false;
        }
    })
    if(   i ==  0 ) res_div.append('<a class="more">...'+ langN('menu137') +'</a>');
    if( i++ >= 20 ) res_div.append('<a class="more">...'+ langN('menu136') +'</a>');
    return res_div;
}

function search_trim(t) {
    var tt = '';
    for (var i = 0; i < t.length; i++) {
        var code = t.charCodeAt(i);
        if (12549 <= code && code <= 12585) {
            tt += String.fromCharCode(code);
        }
    }
    return t.replace(tt, '');;
}
// map move
function pzone_go( zoneid ) {
    if( Gtmp['pop_timer'] == false ) return false;
    //
    var zone_select = '#pop_'+zoneid;
    var cleft= $(zone_select).position().left;
    var ctop = $(zone_select).position().top;
    map_move( cleft, ctop-50 );
    var x = parseInt( $(zone_select).css('left') )+90;
    var y = parseInt( $(zone_select).css('top') );
    arrow_there( x, y );
}
function tzone_go( zoneid ) {
    if( Gtmp['pop_timer'] == false ) return false;
    //
    var zone_select = '#t'+zoneid;
    var cleft= $(zone_select).position().left;
    var ctop = $(zone_select).position().top;
    map_move( cleft, ctop-50 );
    var x = parseInt( $(zone_select).css('left') )+70;
    var y = parseInt( $(zone_select).css('top') );
    arrow_there( x, y );
}
function city_go( cityid ) {
    right_box_close();
    // 
    var cleft = $('#'+cityid).position().left;
    var ctop = $('#'+cityid).position().top;
    map_move( cleft, ctop );
    //
    $('#'+cityid+' .icon').click();
    Gtmp['ShowInScreen'] = {};
}
function discov_go( dxy ) {
    var ddxy = $( '.dxy_'+dxy );
    $('#light_box').hide();
    map_move( ddxy.position().left , ddxy.position().top, function() { ddxy.click(); } );
}
function barter_go( disid ) {
    var did = '#'+disid+'_barter';
    $('#light_box').hide();
    map_move( $( did ).position().left , $( did ).position().top, function() { $( did ).click(); } );
}
function id_go( id ) {
    var go_id = '#'+id;
    $('#light_box').hide();
    map_move( $( go_id ).position().left , $( go_id ).position().top, function() { $( go_id ).click(); } );
}
function xy_go( x, y ) {
    ping_there( 'ping_mouse', x, y);
    var Pselect = '#ping_ping_mouse';
    var cleft= $(Pselect).position().left;
    var ctop = $(Pselect).position().top;
    map_move( cleft, ctop-50 );
    var x = parseInt( $(Pselect).css('left') )-45;
    var y = parseInt( $(Pselect).css('top') )-15;
    arrow_there( x, y );
}
//  <img src="/img/common/citygo1.png" />
function ping_there( id, x, y, go='' ) {
    var ping = $('#ping_'+id);
    if( ping.length == 0 ) {
        var ping = $('<div id="ping_'+id+'" class="ping_there"><img src="/img/common/citygo2.png" /></div>')
            .click( function(){ $(this).hide();$('#city_there').hide(); } );
        $('#city').append( ping );
    }
    ping.css({ 'left': x +'px', 'top': y +'px' }).show();
    //
    if( go != '' ) {
        var cleft= ping.position().left;
        var ctop = ping.position().top;
        map_move( cleft, ctop );
        arrow_there( x-27, y-30, 20 );
    }
}
function arrow_there( x, y, w=60 ) {
    //  設定箭頭 
    $('#city_there')
        .css({ 'left': x+'px', 'top': y+'px' })
        .width(w)
        .show()
}
//  要先 * -1
function map_move( mL, mT, callback ) {
    //
    var sw = $(window).width() / 2;
    var sh = $(window).height() / 2;
    //
    mL = mL * -1;
    mT = mT * -1;
    //
    sw += -180;
    if( Box_Left_Show == 1 ) sw += 175;
    if( Box_Left2_Show == 1 ) sw += 150;
    //
    transform.left = mL + sw;
    transform.top = mT + sh;
    wrap.animateTransform("translate("+transform.left+"px,"+transform.top+"px);", 750, callback);
    setTransform();
}
//  xys = [ {'city':'town1302','bg':'yellow'}, {'xy':'4202﹐2363'}, {'xy':'3974﹐2559'} ];
function minimap( xys ) {
    var mm = $('#minimap').html('');
    //
    $.each( xys, function( n, v ){
        var go = 'xy';
        var title = '';
        var bg = '';
        var cl = '';
        var x = 0;
        var y = 0;
        if( typeof v.xy !== 'undefined' ) {
            x = v.xy.split('﹐')[0];
            y = v.xy.split('﹐')[1];
        }
        if( typeof v.city !== 'undefined' ) {
            go = 'city';
            title = langN( v.city );
            var c = json_city[v.city];
            x = c.x*1 + 45;
            y = c.y*1 + 5;
        }
        if( typeof v.title !== 'undefined' ) title = v.title;
        if( typeof v.bg !== 'undefined' ) bg = v.bg;
        if( typeof v.cl !== 'undefined' ) cl = v.cl;
        
        
        //
        var mleft = x * 0.03;
        var mtop  = y * 0.03;
        var i = $('<i style="top:'+mtop+'px;left:'+mleft+'px;"></i>');
        if( title !== '' ) i.attr( 'data-tooltip', title );
        if( bg !== ''    ) i.css( 'background', bg );
        if( cl !== ''    ) i.addClass( cl );
        if( go == 'xy'   ) i.click( function(){ xy_go( x, y ); } )
        if( go == 'city' ) i.click( function(){ city_go( v.city ); } )
        
        //
        i.click( function(){ $('#minimap').removeClass('big'); } )
        mm.append( i );
    });
    //
    mm.append( $('<b class="btn close_map">x</b>').click( function(){ $('#minimap').hide(); } ) );
    mm.append( $('<b class="btn scale s1">+</b>').click( function(){ $('#minimap').addClass('big'); } ) );
    mm.append( $('<b class="btn scale s2">-</b>').click( function(){ $('#minimap').removeClass('big'); } ) );
    mm.show();
}

//  
function show_babala( girl ) {
    var babala = $('#babala').html('');
    Gtmp['babala_show'] = cache( 'show_babala', null, {'def':'1'} );
    Gtmp['babala_girl'] = cache( 'babala_girl', null, {'def':'bg_eva'} );
    if( Gtmp['babala_show'] == '1' ) {
        var webm = typeof girl === 'undefined' ? Gtmp['babala_girl'] : girl;
        babala.append('<video autoplay loop muted playsinline class="'+Gtmp['babala_girl']+'"><source src="/img/'+ webm +'.webm" type="video/webm"></video>')
            .append( $('<div class="org_box"><span class="org_bot_cor"></span><div class="marquee"><div class="marquee-wrap"><div class="marquee-content" id="say"></div></div></div></div>').click(function(){ $('#lt_menu .btn8').click(); }) )
    }else{
        babala.html( $('<div class="org_box"><div class="marquee"><div class="marquee-wrap"><div class="marquee-content" id="say"></div></div></div></div>').click(function(){ $('#lt_menu .btn8').click(); }) )
    }
    babala_say();
}

//  $('#say').html('')
function babala_say( say = 0 ) {
    //  整點更新
    if( nMin == 0 && nSec == 0 ) return $.loadScript('/json_donate.js?v='+ver+'&t='+(now-now%3600), function(){ babala_say() } );
    if( typeof web_says === 'undefined' ) return $.loadScript('/json_donate.js?v='+ver+'&t='+(now-now%3600), function(){ babala_say() } );
    //
    if( typeof Gtmp['babala_says'] === 'undefined' ) {
        Gtmp['babala_says'] = [].concat( web_says, donate_says );
        if( Gtmp['babala_show'] == '1' ) Gtmp['babala_says'] = Gtmp['babala_says'].concat( babala_says );
    }
    //
    var saytxt = '';
    if( nSec == 0 ) {
        saytxt = Gtmp['babala_says'][1];
    }else if( nSec == 20 || nSec == 40 ) {
        //var s = parseInt( Math.random() * ( nSec == 20 ? 10 : donate_arr.length ) );
        var s = parseInt( Math.random() * donate_arr.length );
        saytxt = '🧡感謝來自 <b>' + donate_arr[s][1] + '</b> 的'+( donate_arr[s][2] != '' ? donate_arr[s][2] : '贊助' )+' ('+donate_arr[s][0]+')';
    }else{
        var s = parseInt( Math.random() * Gtmp['babala_says'].length );
        saytxt = Gtmp['babala_says'][s];
    }
    //
    $('#say').html( saytxt );
}
//
function json_get( jsn, callback ) {
    if( jsn == 'char' || jsn == 'json_char' ) {
        if( typeof json_char === 'undefined' ) return $.loadScript('/js/json_char.js?v='+ver, callback);
        callback();
        return false;
    }
    if( jsn.indexOf('lang') !== -1 ) {
        $.loadScript('/js/'+ jsn +'.js?v='+ver+ver_lang, callback);
        return false;
    }
    //
    $.loadScript('/js/'+ jsn +'.js?v='+ver, callback);
}
//
function load_city_char() {
    var cityid = CityNow;
    var city_char_list = '';
    $.each( city_char[cityid], function( i, charid ) {
        var c = char(charid);
        city_char_list
           += '<li class="char '+ charid +' rank_'+ c.rank +'">'
                +'<div class="thumb grade_'+ c.rank +' up_'+ c.up +'" data-charid="'+ charid +'">'
                    +'<em class="have '+have( charid )+'"></em>'
                    +'<em class="type '+c.type+'"></em>'
                    +'<img src="'+img_src( 'char', charid )+'">'
                +'</div>'
            +'</li>';
    });
    $('#city_char_main').html( city_char_list );
}

//
function box_left_load( menu, callback ) {
    //
    Box_Left_Now = menu;
    switch( menu ) {
        case 'config':
            box_left_config()
            break;
        case 'day':
            box_left_day()
            break;
        case 'discov':
            box_left_discov( callback )
            break;
        case 'donate':
            box_left_donate()
            break;
        case 'pop':
            box_left_pop()
            break;
        case 'trade':
            box_left_trade()
            break;
        case 'comments':
            box_left_comments()
            break;
        case 'uplog':
            box_left_uplog()
            break;
        case 'char':
            json_get( 'char', function(){ box_left_char(); } );
            break;
        default:
            break;
    }
    url_hash( 'm', menu );
}
//
//  arr={'def':'0','check':'day|week'}
//  html_checkbox( 'chk_week_war', '', '模擬戰', {'def':'0',,'check':'day'}, function(){} )
//
function html_checkbox( id, sclass ,txt, arr={}, callback=function(){} ) {
    if( typeof arr['def'] === 'undefined' ) arr['def'] = 0;
    //
    var res = cache( id, null, arr );
    var checkedValue = '1';
    //  每日/週
    if( typeof arr['check'] !== 'undefined' ) {
        var check_time = arr['check'] == 'week' ? ChangeWeekTime : ChangeDayTime;
        if( res < check_time ) res = '0';
        checkedValue = now;
    }
    //
    var data_more = '';
    var span_txt = $('<span></span>').append( txt );
    var cityid = 0;
    if( typeof arr['citygo'] !== 'undefined' ) {
        cityid = arr['citygo'];
        data_more = 'data-cityid="'+ cityid +'"';
        span_txt.append( $('<img class="citygo" src="/img/common/'+ ( city_config( cityid, 'ship_inved' ) == '1' ? 'citygo2' : 'citygo' ) +'.png" />').click(function(e){
            e.preventDefault();
            cache( 'box_hide.ship_main' , '0' );
            city_go( cityid );
        }) );
    }
    //
    var label = $('<label id="'+ id +'" class="label '+ sclass +'" for="'+ id +'_input" '+ data_more +'/>')
            .append( 
                $('<input type="checkbox" id="'+ id +'_input" name="'+ id +'">')
                    .change( function(){
                            res = cache( id, ( this.checked ? checkedValue : '0') );
                            if( res == '0' ) {
                                $('.ship_'+cityid).removeClass('checked');
                            }else{
                                $('.ship_'+cityid).addClass('checked');
                            }
                            if( typeof callback == 'function' ) callback(res);
                        } )
                    .prop( 'checked', ( res == '0' ? false : true ) )
            )
            .append( span_txt )
    return label;
}

//
function box_left_config() {
    //  設定
    var Box_config = $('<div class="box" />');
        var babala_girl = $('<select id="babala_girl"></select>')
                .append( '<option value="bg_babala">'+ langN('chaabt010') +'</option>' )
                .append( '<option value="bg_shallan">'+ langN('chasbb033') +'</option>' )
                .append( '<option value="bg_natasha">'+ langN('chasbt016') +'</option>' )
                .append( '<option value="bg_eva">'+ langN('chasct015') +'</option>' )
                .append( '<option value="bg_sina">'+ langN('chasT023') +'</option>' )
                .append( '<option value="bg_angelica">'+ langN('chasbt020') +'</option>' )
                .append( '<option value="bg_simonetta">'+ langN('chaabt012') +'</option>' )
                .append( '<option value="bg_kirch">'+ langN('chasbd003') +'</option>' )
                .append( '<option value="bg_anisa">'+ langN('chascd020') +'</option>' )
                .val( cache( 'babala_girl') )
                .change( function() { cache( 'babala_girl', $(this).val() ); show_babala(); } )
        var show_babala_txt = $('<span></span>')
                .append( lang('menu17') )
                .append( lang('menu189') + '：' )
                .append( babala_girl )
        var Box_config_main = $('<div id="map_config" class="box_main config emoji" />')
                .append( html_checkbox( 'show_map',''         ,lang('menu17')+lang('menu83')                                     , {'def':'1'}, function(res){ show_map() } ) )
                .append( html_checkbox( 'show_pop_box',''     ,lang('menu17')+lang('menu58')                                     , {'def':'1'}, function(res){ pop_set() } ) )
                .append( html_checkbox( 'show_tzone_box',''   ,lang('menu17')+lang('menu135')                                    , {'def':'1'}, function(res){ tzone_set() } ) )
                .append( html_checkbox( 'show_todo_list',''   ,lang('menu17')+lang('menu77')                                     , {'def':'1'}, function(res){ show_todo_list() } ) )
                .append( html_checkbox( 'show_citytime',''    ,lang('menu17')+lang('menu18')                                     , {'def':'1'}, function(res){ map_show( 'show_citytime'    , '.city .timer' ) } ) )
                .append( html_checkbox( 'show_tool_all',''    ,lang('menu17')+'<img src="/img/shop3.png">'+lang('menu9')         , {'def':'1'}, function(res){ map_show( 'show_tool_all'    , '.city .have_tool' ) } ) )
                .append( html_checkbox( 'show_bar_all', ''    ,lang('menu17')+'<img src="/img/bar2.png">'+lang('menu7')          , {'def':'1'}, function(res){ map_show( 'show_bar_all'     , '.city .have_bar' ) } ) )
                .append( html_checkbox( 'show_wood_all',''    ,lang('menu17')+'<img src="/img/ship3.png">'+lang('menu11')        , {'def':'1'}, function(res){ map_show( 'show_wood_all'    , '.city .have_wood' ) } ) )
                .append( html_checkbox( 'show_be_all',''      ,lang('menu17')+'⛪🛕🕌☯️'+lang('menu103')                         , {'def':'1'}, function(res){ map_show( 'show_be_all'      , '.city .have_be' ) } ) )
                .append( html_checkbox( 'show_sm_all',''      ,lang('menu17')+'<b class="emoji be">🦸🏿‍♂️</b>'+lang('menu219')      , {'def':'1'}, function(res){ map_show( 'show_sm_all'      , '.city .have_sm' ) } ) )
                .append( html_checkbox( 'show_village',''     ,lang('menu17')+'<img src="/img/village.png">'+lang('menu70')      , {'def':'1'}, function(res){ map_show( 'show_village'     , '#city .village' ) } ) )
                .append( html_checkbox( 'show_search',''      ,lang('menu17')+'<img src="/img/search.png">'+lang('menu68')       , {'def':'1'}, function(res){ map_show( 'show_search'      , '#city .search' ) } ) )
                .append( html_checkbox( 'show_search_sea',''  ,lang('menu17')+'<img src="/img/search_sea.png">'+ lang('menu71')  , {'def':'1'}, function(res){ map_show( 'show_search_sea'  , '#city .search_sea' ) } ) )
                .append( html_checkbox( 'show_fish',''        ,lang('menu17')+'<img src="/img/fish.png">'+lang('menu69')         , {'def':'1'}, function(res){ map_show( 'show_fish'        , '#city .fish' ) } ) )
                .append( html_checkbox( 'show_seasave_box','' ,lang('menu17')+'🔔'+lang('menu216')                               , {'def':'1'}, function(res){ seasave_set() } ) )
                .append( html_checkbox( 'show_wind',''        ,lang('menu17')+'🎏'+lang('menu140')                               , {'def':'0'}, function(res){ wind_checkbox() } ) )
                .append( html_checkbox( 'show_translate',''   ,lang('menu17')+'<img src="/img/translate.ico">'+ lang('menu156')  , {'def':'1'}, function(res){ } ) )
                .append( html_checkbox( 'show_babala',''      ,show_babala_txt                                                   , {'def':'1'}, function(res){ show_babala() } ) )

        var Box_config_lang = $('<div id="lang_config" class="box_main config" />')
                .append('<a class="cht" onclick="lang_select(\'cht\');">繁</a>')
                .append('<a class="chs" onclick="lang_select(\'chs\');">简</a>')
                .append('<a class="jp"  onclick="lang_select(\'jp\');" >JP</a>')
                .append('<a class="kr"  onclick="lang_select(\'kr\');" >KR</a>')
                .append('<a class="eng" onclick="lang_select(\'eng\');">EN</a>')

        var Box_config_hotkey = $('<div id="hotkey" class="box_main hotkey" />')
                .append( '<label><b>Esc</b>'+           lang('menu36') +'</label>' )
                .append( '<label><b>Alt+1~7</b>'+       lang('menu37') +'</label>' )
                .append( '<label><b>1~7</b>'+           lang('menu38') +'</label>' )
                .append( '<label><b>Ctrl+F(Alt+S)</b>'+ lang('menu39') +'</label>' )
                .append( '<label><b>Alt+W</b>'+         lang('menu140') +'</label>' )

        var Box_config_backup = $('<div id="backup" class="box_main backup" />')
            var backup_txt = '';
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                var v = localStorage.getItem( k );
                backup_txt += k + ":" + v + "\n";
            }
            Box_config_backup
                .append('<textarea id="backup_main" class="box_txt" onclick="this.select()">'+ backup_txt +'</textarea>')
                .append($('<a class="rebackup">'+lang('menu60')+'</a>').click(function(){
                    if( confirm( lang('menu61','','n') ) ) {
                        localStorage.clear();
                        $.each( $('#backup_main').val().split("\n"), function( i, kv ){
                            var kva = kv.split(":");
                            if( kva[0] == '' ) return;
                            cache( kva[0], kva[1] );
                        })
                        if( confirm( lang('menu62','','n') ) ) location.reload();
                    }
                }))
                .append($('<a class="rebackup">'+lang('menu63')+'</a>').click(function(){
                    if( confirm( lang('menu64','','n') ) ) {
                        localStorage.clear();
                        if( confirm( lang('menu65','','n') ) ) location.reload();
                    }
                }))
//
    Box_config
        .append( '<h5>'+lang('menu16')+'<span class="h5_menu">'+ lang('menu23') +'</span></h5>' )
        .append( Box_config_main )
        .append( '<h5>語言 Language</h5>' )
        .append( Box_config_lang )
        .append( '<h5>熱鍵 HotKey</h5>' )
        .append( Box_config_hotkey )
        .append( '<h5>備份 Backup</h5>' )
        .append( Box_config_backup )
        .append( '<div style="height: 30px;"></div>' )

    if( TestMode || Gtmp['TestMode'] ) {
        Gtmp['TestMode'] = true;
        Box_config
        .append( '<h5>測試用</h5>' )
        .append( 
            $('<div></div>')
            .append( $('<a class="rebackup">打開 Test Mode </a>').click(function(){ TestMode=true; cache('testmode',true); }) )
            .append( $('<a class="rebackup">關閉 Test Mode </a>').click(function(){ TestMode=false; cache('testmode',false); }) )
        )
        .append( '<div style="height: 30px;"></div>' )
    }

    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
        Box_left_body.append( Box_config );
    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main"></ul>');
    //
    var Box_left = $('#box_left').html('');
        Box_left
            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
            .append( Box_menu )
            .append( Box_left_body )
    //
    left_box_show();
    $('#lang_config a.'+langNow).addClass('selected');
}
//
function box_left_day() {
    //  每日
    var Box_chkday = $('<div id="check_day" class="box" />');
    var Box_chkday_main = $('<div id="chkday_main" class="box_main config" />')
            //  todo 每日銀行儲蓄
            .append( html_checkbox( 'chk_day_misson'    , '', lang('menu46'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_roymison'  , '', lang('menu47'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_shopfree'  , '', lang('menu48'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_friend'    , '', lang('menu49'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_landadv'   , '', lang('menu50'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_commison'  , '', lang('menu51'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_privilege' , '', lang('menu52'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_gameevent' , '', lang('menu53'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_bank'      , '', lang('menu56'), {'check':'day'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_day_war'       , '', lang('menu20'), {'check':'day'}, function(){ check_tipred() } ) )

            .append( html_checkbox( 'chk_week_misson'   , '', lang('menu59') + ' ('+ lang('menu21') +')', {'check':'week'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_week_royal'    , '', lang('menu22') + ' ('+ lang('menu21') +')', {'check':'week'}, function(){ check_tipred() } ) )
            .append( html_checkbox( 'chk_week_commison' , '', lang('menu142')+ ' ('+ lang('menu21') +')', {'check':'week'}, function(){ check_tipred() } ) )
        //
        Box_chkday
            .append( Box_chkday_main )

    //  每周船材
    var Box_chkweek = $('<div id="check_week" class="box" />');
        var week_wooks = {};
        week_wooks['item202s004'] = '(Lv.20+)';     //超大型甲骨 
        week_wooks['item202s014'] = '(Lv.24)';      //強化黑檀木
        week_wooks['item202s011'] = '(Lv.23)';      //強化胡桃木
        week_wooks['item202s008'] = '(Lv.22)';      //強化柚木
        week_wooks['item202s005'] = '(Lv.21)';      //強化紫檀木
        week_wooks['item202s001'] = '(Lv.20)';      //強化山毛櫸
        week_wooks['item202a013'] = '(Lv.19)';      //強化赤楊
        week_wooks['item202a011'] = '(Lv.18)';      //強化赤松
        week_wooks['item202a047'] = '(Lv.17)';      //強化雲杉木
        week_wooks['item202a031'] = '(Lv.16)';      //強化日本柳杉木
        week_wooks['item202a023'] = '(Lv.15)';      //黑檀木
        week_wooks['item202a020'] = '(Lv.14)';      //胡桃木   
        week_wooks['item202a040'] = '(Lv.13)';      //柚木     
        week_wooks['item202a043'] = '(Lv.13~19)';   //大型甲骨 
        week_wooks['item203a001'] = '(Lv.13~19)';   //大型通
        week_wooks['item202s019'] = '(Lv.11~12)';   //紫檀木   
        week_wooks['item202b010'] = '(Lv.9~10)';    //山毛     
        week_wooks['item202b029'] = '(Lv.7~8)';     //赤楊     
        week_wooks['item202c054'] = '(Lv.5~6)';     //赤松     
        week_wooks['item202b054'] = '(Lv.5~12)';    //中型甲骨
        
        //
        $.each( week_wooks, function( woodid, wood_lv ){
            //
            var hide_wood = cache( 'box_hide.'+ woodid+'_main' );
            var Box_chkweek_h5 = $('<h5 class="h5_btn" data-bid="'+woodid+'_main"><b class="'+ ( hide_wood=='1'?'show':'hide') +'"></b>'+ lang('menu40') +': '+ lang( woodid ) + wood_lv +'</h5>')
            var Box_chkweek_main = $('<div id="'+woodid+'_main" class="chkweek_main box_main config" style="'+ ( hide_wood=='1'?'display:none':'') +'"/>');
            $.each( wood_citys[woodid], function( cityid, chked ) {
                if( city_config( cityid, 'hide_icon_ship' ) == '1' ) return;
                Box_chkweek_main.append( html_checkbox( 'check_wood.' + cityid, woodid, lang( cityid ), {'check':'week','citygo':cityid}, function(){ check_tipred() } ) );
            });
            //
            Box_chkweek
                .append( Box_chkweek_h5 )
                .append( Box_chkweek_main )
        });
    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
        Box_left_body
            .append( Box_chkday )
            .append( Box_chkweek )
            .append( '<div style="height: 30px;"></div>' )

    //  Menu
    var Box_menu = $('<div id="box_left_menu" class="box_main">'+lang('menu19')+' / '+lang('menu21')+'</div');
    //
    var Box_left = $('#box_left').html('');
        Box_left
            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
            .append( Box_menu )
            .append( Box_left_body )
    //
    left_box_show();
    check_tipred();
}
function check_tipred() {
    if( $('#check_day input:not(:checked)').length == 0 ) {
        $('#lt_menu .tip').removeClass('red');
    }else{
        $('#lt_menu .tip').addClass('red');
    }
}
//
function box_left_discov( callback ) {
    //
    var Box_left = $('#box_left').html('');
    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main"></ul>')
        .append( $('<li class="box_discov selected">'+lang('menu96')+'</li>').click( function(){ left_menu_select( 'box_discov' );$('#box_left_menu b').show(); } ) )
        .append( $('<li class="box_discov_zone"><img class="new" src="/img/common/new.png" />'+lang('menu230')+'</li>').click( function(){ left_menu_select( 'box_discov_zone' );$('#box_left_menu b').hide();$('#box_discov_zone li').show(); } ) )
    //
    var Btn_filter = $('<b class="filter"/>').click(function(){ box_discov_filter('discov') });
    var Btn_list_mode = $('<b class="btn_list_mode"/>').click(function(){ $('#box_left').toggleClass('list_mode') });
    //
    Box_menu
        .append( Btn_list_mode )
        .append( Btn_filter )
    Box_left
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
        .append( Box_menu )

    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
    //  船員
    var Box_discov = $('<div id="box_discov" class="box" />');
    var discov_tips = $('<div id="discov_tips" class="box" />');
    var discov_ul = $('<ul class="box_main" />');
    var discov_list = '';
    $.each( discovery, function( disid, d ) {
        if( disid == '' || disid[6] == 'T' ) return;
        var discov_q = '';
        if( d.g == 'menu72' ) discov_q += '<span class="quest" onclick="quest_info_show(\''+d.q+'\');event.stopPropagation()"><img src="/img/common/uwo_icon_class_1.png" class="move2">【'+langN('menu72')+': ' + lang( d.q ) + '】</span>';
        if( d.g == 'menu73' ) discov_q += '【'+langN(d.char)+ langN('menu73') +'】';
        if( typeof d.v !== 'undefined' ) discov_q += list2lang( d.v );
        if( typeof d.nt !== 'undefined' ) discov_q += list2lang( d.nt, 'dnote translate' );
        if( typeof d.c !== 'undefined' ) {
            var dc = discov_clues[d.c];
            if( dc.x !== '' ) discov_q += '<span class="cl_go emoji" onclick="discov_go( \''+dc.x+'_'+dc.y+'\' );event.stopPropagation()">📜 '+ langN( dc.l == 1 ? 'menu199' : 'menu200' ) +' ( '+ dc.n +', '+ dc.e +' )</span>';
        }
        if( discov_q !== '' ) discov_q = '<span class="dreq">'+ discov_q +'</span>';
        //
        var dxy = d.x + '_' + d.y;
        var dxy_go = d.x > 0 ? '<img data-dxy="'+ dxy +'" class="move" src="/img/common/citygo.png">' : '';
        if( typeof d.xy2 !== 'undefined' ) {
            $.each( d.xy2, function(i,dxy){
                dxy_go += '<img data-dxy="'+ dxy +'" class="move" src="/img/common/citygo.png">';
            });
        }
        //
        var dname = lang( disid, 'dname translate' );
        var dtype = '<span class="discov_type">【' + lang( d.t1 ) + ' > ' + lang( d.t2 ) + '】</span>';
        if( d.m == 'clues' ) {
            dname = '<span class="dname">' + lang( d.d ) + ' ' + lang( 'menu201' ) + '</span>';
            dtype = '<span class="discov_type">【' + lang( 'menu202' ) + '】</span>';
        }
        //
        discov_list
           += '<li class="dis_box '+ disid +' rank_'+d.r +' gender_'+d.r+' gou_'+have( disid )+' '+ d.t1 +' '+ d.t2 +'">'
                +'<div class="thumb in_left_box grade_'+ d.r +'" data-disid="'+ disid +'">'
                    +'<em class="have '+have( disid )+'"></em>'
                    +'<img class="lazy" data-src="'+ img_src( 'discov', disid ) +'" />'
                    +'<div class="list_data">'
                        + dxy_go
                        + dname
                        + dtype
                        + discov_q
                        + lang( disid+'_req', 'dreq translate', '' ,'' )
                    +'</div>'
                +'</div>'
            +'</li>';
    })
    discov_ul.html( discov_list );
    //
    discov_ul
        .on( 'click', '.thumb', function() { 
            var disid = $(this).data('disid');
            var d = discovery[disid];
            if( typeof d.x == 'undefined' ) d.x = 0;
            if( typeof d.y == 'undefined' ) d.y = 0;
            var dxy = d.x + '_' + d.y;
            $('.'+disid+' .have').toggleClass( 'gou', (have( disid, true ) == 'gou') );
            check_discov_gou( dxy );
        })
        .on( 'click', '.move', function() { 
            var dxy = $(this).data('dxy');
            discov_go( dxy );
            return false;
        })
    //
    Box_discov
        .append( discov_tips )
        .append( discov_ul )

    //  box_discov_zone
    var box_dz = $('<ul></ul>');
    $.each( discov_zone, function( dzid, dz ) {
        if( typeof dz.s === 'undefined' || typeof dz.r === 'undefined' ) return;
        box_dz.append( '<li class="'+ dz.r.join(' ') +'">'
            + lang( dz.id , 'dz' )
            + '<img data-dxy="'+ dzid +'" class="move" src="/img/common/citygo.png">'
            + '<span class="sleep"><b>'+ dz.s +'</b> / <b>'+ dz.f[0] +'</b> / <b>'+ dz.f[1] +'</b> / <b>'+ dz.f[2] +'</b></span>'
            + '<div class="res">'+langAry(dz.r, 'item translate')+'</div>'
            +'</li>' );
    } );
    box_dz.on( 'click', '.move', function() { 
        var dxy = $(this).data('dxy');
        discov_go( dxy );
        return false;
    })

    //
    var body_main_discov_res = $('<div id="box_discov_zone" class="box" style="display:none;"></div>')
        .append( box_dz )

    //
    Box_left_body
        .append( Box_discov )
        .append( body_main_discov_res )
        .append( '<div style="clear:both; height:50px;" />' )
    //
    Box_left.append( Box_left_body )
    //
    left_box_show();
    //
    $('img.lazy').lazyload( { effect : 'fadeIn' } );
    //
    if( typeof callback == 'function' ) callback();
}
function box_discov_filter( type='discov' ) {
    $('#box_discov').attr('class','box');
    $('#box_discov li').show();

    var type_name = '';
    if( type == 'discov' ) {
        type_name = langN('menu131') + ' ' + langN('menu96');
        //  tool_search
        var tool_search = $('<div class="tool_search"></div>').append(
                $('<input type="text" placeholder="'+type_name+'" autocomplete="off" disableautocomplete>')
                .change( function(){
                    var sInput = search_trim( $(this).val() );
                    if( sInput != '' ) {
                        //
                        var tips_h5 = $('<h5 class="clang"></h5>')
                            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ discov_tips_close() } ) )
                            .append( langN('menu131') + '：' + sInput )
                        //
                        $('#discov_tips').html( tips_h5 );
                        //
                        $('#box_left').addClass('list_mode')
                        $('#box_discov li').hide();
                        $('#box_discov').find('li:contains('+ sInput +')').show();
                        //
                        if( sInput[0] == 'd' ) {
                            var safeInput = sInput.replace(/[^a-zA-Z0-9]/g, '');
                            if( safeInput != '' ) $('#box_discov li.'+safeInput).show();
                        }
                    }else{
                        discov_tips_close();
                    }
                } )
            );
        //  tool_main
        var tool_main = $('<div id="tool_main" class="tool_main main_scroll"></div>');
            //  tool_filter_rank
            var tool_filter_rank = $('<div class="filter_main tool_filter_rank"></div>');
                $.each( [5,4,3,2,1], function( i, v ) {
                    tool_filter_rank.append( $('<div class="thumb grade_'+ v +'" data-filter="rank_'+ v +'"></div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        discov_filter();
                    }) );
                } );
            //  tool_filter_gou
            var tool_filter_gou = $('<div class="filter_main tool_filter_gou"></div>');
                $.each( ['gou',''], function( i, v ) {
                    tool_filter_gou.append( $('<div class="filter_gou" data-filter="gou_'+ v +'"><span class="have gou_'+ v +'"></span></div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        discov_filter();
                    }) );
                } );
            //  
            var tool_filter_type = $('<div class="filter_main tool_filter_type"></div>');
                $.each( discov_types, function( t1, t2arr ) {
                    tool_filter_type.append('<h6>'+ lang( t1 ) +'</h6>');
                    $.each( t2arr, function( t2, t2count ) {
                        tool_filter_type.append( $('<div class="filter_type" data-filter="'+ t2 +'">'+ lang( t2 ) +'</div>').click(function(){
                            if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                            discov_filter();
                        }) );
                    })
                } );
            var tool_filter_type_h6 = $('<h6 class="filter_type_h6">'+lang('menu76')+'</h6>')
                .append( $('<a>'+ lang('menu121') +'</a>').click( function(){ $('.filter_type').toggleClass('filter');discov_filter(); } ) )
            
        tool_main
            .append( '<h6>'+ lang('menu75') +'</h6>' )
            .append( tool_filter_rank )
            .append( tool_filter_gou )
            .append( tool_filter_type_h6 )
            .append( tool_filter_type )
            
    }
    if( type_name == '' ) return false;

    //  box_tool
    var Box_tool = $('#box_tool').html('');
    //  Menu
    var Box_tool_menu = $('<ul id="box_tool_menu" class="box_main"></ul>')
            .append( $('<li class="'+ ( type=='discov' ? 'selected' :  '' ) +'">'+lang('menu96')+'</li>') )
    //
    Box_tool
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ box_tool_close('discov') } ) )
        .append( Box_tool_menu )
        .append( tool_search )
        .append( tool_main )
        .show();
    //
    Box_Tool_Show = 1;
    if( isMobile() ) left2_box_close(); // 防止重疊
    //
    box_resize();
}
//
function discov_filter() {
    $('#box_discov').attr('class','box');
    $('#box_tool .filter').each(function(){
        var f = $(this).data('filter');
        $('#box_discov').addClass( 'hide_'+f );
    });
}
function discov_tips_close(){
    $('#discov_tips').html('');
    $('#box_discov .em_more').html('').hide();
    $('#box_discov .box_more').html('');
    $('.tool_search input').val('');
    //
    $('#box_discov').removeClass('show_more');
    //
    $('#box_discov li' ).show();
}

//
function box_left_comments() {
    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
        Box_left_body
            .append('<div class="alert">※請遵守網路聊天禮儀! 網站資料陸續校對中,如有錯漏歡迎補充.也可到<a href="https://forum.gamer.com.tw/C.php?bsn=35715&snA=397" target="_blank" style="color: blue;">巴哈討論串</a>.</div>')
            //.append('<iframe src="https://discord.com/widget?id=268245353898311681&theme=dark" width="350" height="500" allowtransparency="true" frameborder="0" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"></iframe>')
            .append('<div class="fb-comments" data-href="https://voyage.tw/#m=comments" data-width="345" data-numposts="20" data-order-by="reverse_time"></div>')
    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main"></ul>');
    //
    var Box_left = $('#box_left').html('');
        Box_left
            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
            .append( Box_menu )
            .append( Box_left_body )
    //
    left_box_show();
    //
    FB.XFBML.parse( null );
}
//
function box_left_uplog() {
    var lang_L = {0:'KR',1:'CHT',2:'CHS',3:'JP',4:'ENG',5:'XY'};

    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
        var logs = $('<ul class="logs"></ul>');
        //
        $.each( up_logs, function( i, log ){
            var k = log['n1'];
            var dxy_go = '';
            var name = $('<span>'+log['t'] + lang( k, 'translate titop' ) + lang( log['n2'], 'translate titop' ) + lang( log['n3'] )+'</span>')
            var vlog = $('<div class="report vlog emoji"></div>')
            //
            if( log['e'] !== '' ) name.addClass('go').click( function(){ eval(log['e']) } ).addClass('go');
            if( k.indexOf('discov') !== -1 && typeof discovery[k] !== 'undefined' ) {
                name.addClass('go').click(function(){ box_left_load( 'discov', function(){ $('#box_left').addClass('list_mode'); $('#box_discov li').hide(); $('#box_discov li.'+k).show(); } ); })
                //
                var d = discovery[k];
                var dxy = d.x + '_' + d.y;
                dxy_go = d.x > 0 ? '<img data-dxy="'+ dxy +'" class="move go" src="/img/common/citygo.png">' : '';
                if( typeof d.xy2 !== 'undefined' ) {
                    $.each( d.xy2, function(i,dxy){
                        dxy_go += '<img data-dxy="'+ dxy +'" class="move go" src="/img/common/citygo.png">';
                    });
                }
            }
            //  回報人
            if( typeof log['d2'] == 'undefined' ) log['d2'] = 'voyage.tw';
            //
            vlog.append( name )
                .append( dxy_go )
            //
            var li = $('<li></li>')
                   .append( vlog )
                   .append( '<div class="informant">'+ lang('menu157') + ':<b>' + log['d2'] +'</b>' + log['d'] +'</div>' )
            logs.append( li );
        } )
        //
        $.each( up_log, function( time, log ){
            if( log['lang'] == 5 ) return;
            //
            var k = log['key'];
            var log_more = $('<a class="link"></a>');
                if( k.indexOf('discov') !== -1 && typeof discovery[k]   !== 'undefined' ) log_more.append( langN('menu96') ).click(function(){ box_left_load( 'discov', function(){ $('#box_left').addClass('list_mode'); $('#box_discov li').hide(); $('#box_discov li.'+k).show(); } ); });
                if( k.indexOf('quest')  !== -1 && typeof quests[k]      !== 'undefined' ) log_more.append( langN('menu72') ).click(function(){ quest_info_show( k ) });
                if( k.indexOf('trade')  !== -1 && typeof trades[k]      !== 'undefined' ) log_more.append( langN('menu130')).click(function(){ trade_info_show( k ) });
                if( k.indexOf('chasc')  !== -1 && typeof Gtmp['barG'][k]!== 'undefined' ) log_more.append( langN('menu8')  ).click(function(){ box_right(Gtmp['barG'][k]) });
                if( k.indexOf('cha')    !== -1 && typeof Gtmp['barG'][k]=== 'undefined' ) log_more.append( langN('menu26') ).click(function(){ char_info_show( k.replace('req',''), 'big') });
                if( k.indexOf('skill')  !== -1 ) log_more.append( langN('menu54') ).click(function(){ select_skill( k.replace('des','') ) });

            //
            var li_report = $('<div class="report emoji"></div>')
                    .append('<span class="ll"><img src="//ssl.gstatic.com/translate/favicon.ico">'+ lang_L[log['lang']] +'</span>')
                    .append( log_more.html() !== '' ? log_more : '' )
                    .append('<span class="text">'+ log['text'] +'</span>')
            var day = time.split(' ')[0];
            var li = $('<li class="'+k+'"></li>')
                    .append( li_report )
                    .append( '<div class="informant">'+ lang('menu157') + ':<b>'+ ( log['name'] ? log['name'] : 'No name' ) +'</b>' + day +'</div>' )
            logs.append( li );
        } )
        logs.append('<li>　</li>')
            .on( 'click', '.move', function() { 
                var dxy = $(this).data('dxy');
                discov_go( dxy );
                return false;
            })

        var body_main_log = $('<div id="box_uplog" class="box_main"></div>')
            //.append('<h5>贊助者 sponsor</h5>')
            .append( logs )
        Box_left_body.append( body_main_log );

    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main donate"></ul>')
        .append( $('<li class="log selected">'+ lang('menu207') +'</li>') )
    //
    var Box_left = $('#box_left').html('');
        Box_left
            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
            .append( Box_menu )
            .append( Box_left_body )
    //
    left_box_show();
    //
}
//
function box_left_donate() {
    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
        var sponsor = '';
        $.each( donate_arr, function( i, arr ){
            sponsor = '<li>'+arr[0]+' 感謝 <b>'+arr[1]+'</b> 的'+ ( arr[2] != '' ? arr[2]:'贊助' ) +'</li>'+sponsor;
        } )
        sponsor += '<li>　</li>';

        var opay_main = '<h5>歐付寶 ( 會員編號：1139987 ) (可使用7-11...等超商)</h5>'
                      + '<span style="padding: 5px 10px;font-size: 1.2em;line-height: 26px;display: block; background: #fff;">'
                        + '您可以：<br />'
                        + '　請偷尼喝杯咖啡: 100元<br />'
                        + '　幫芭芭拉付房租: 300元<br />'
                        + '　給芭芭拉零用錢: 自由輸入<br />'
                        + '　<a href="https://payment.opay.tw/Broadcaster/Donate/9DE58599E880A516E4D7B941C128A7CA" target="_blank" style="color: blue;">點我前往歐付寶贊助</a>'
                      + '</span>';

        var body_main_donate = $('<div id="box_donate" class="box"></div>')
            .append('<div class="donate_bg"><span>如果你喜歡這個網站, 可以贊助我一點主機費, 讓網站可以持續運營下去! <br /> If you like this website, you can sponsor me some hosting fees to help keep the website running!</span></div>')
            .append('<h5>贊助 Donate (一次)</h5>')
            .append('<div class="link"><a href="https://www.paypal.com/paypalme/kctony/10" target="_blank" class="btn"><span>Paypal (信用卡)</span></a></div>')
            .append('<div class="link"><a href="https://www.buymeacoffee.com/kctony" target="_blank" class="btn"><span>Buymeacoffee</span></a></div>')
            .append('<div class="link"><a href="https://www.pchomepay.com.tw/button/checkinfo?p1=S0FjT1BySnBaM05hU09NQjVUd3ljdkRWUk05VlRvWkRGLWdFVmpwbFUxUVF6cGhTSyxZNjNZSVdGbURvUCwwdWRjQlZKRUh0cEYsVWVBcEtFOW1ncVc0aUZIZmdVUnE3am9sNC1hdXJOMm9f" target="_blank" class="btn"><span>PChomePay (ATM)</span></a></div>')
            .append('<div class="link"><a class="btn" onclick="$(\'.donate_box\').hide();$(\'#jeco_box\').show();"><span>街口支付</span></a></div>')
            .append('<div class="link"><a class="btn" onclick="$(\'.donate_box\').hide();$(\'#alipay_box\').show();"><span>支付宝 (中国)</span></a></div>')
            .append('<div class="link"><a class="btn" onclick="$(\'.donate_box\').hide();$(\'#wechat_box\').show();"><span>微信 (中国) </span></a></div>')
            .append('<div class="link"><a class="btn" onclick="$(\'.donate_box\').hide();$(\'#opay_box\').show();"><span style="width: 180px;">歐付寶:1139987 (7-11...等)</span></a></div>')

            .append('<div id="jeco_box"   class="donate_box" style="display: none;"><h5>街口支付</h5><a href="https://www.jkos.com/contact-person?j=ContactPerson:900536715" target="_blank"><img src="/img/donate/jeco.jpg" /></a></div>')
            .append('<div id="alipay_box" class="donate_box" style="display: none;"><h5>支付宝</h5><div></div><img src="/img/donate/alipay.jpg" /></div>')
            .append('<div id="wechat_box" class="donate_box" style="display: none;"><h5>微信</h5><div></div><img src="/img/donate/wechat.jpg" /></div>')
            .append('<div id="opay_box"   class="donate_box" style="display: none;">'+ opay_main +'</div>')

            .append('<h5>訂閱 Subscribe (Monthly)</h5>')
            .append('<div class="link"><form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank"><input type="hidden" name="cmd" value="_s-xclick"><input type="hidden" name="hosted_button_id" value="FNCN27PLBRQ8Y"><input type="submit" name="submit" value=" 1 USD/每月(Monthly)"></form></div>')
            .append('<div class="link"><form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank"><input type="hidden" name="cmd" value="_s-xclick"><input type="hidden" name="hosted_button_id" value="4KG5EPJV2S68J"><input type="submit" name="submit" value="10 USD/每月(Monthly)"></form></div>')

            .append('<h5>贊助者 sponsor</h5>')
            .append('<div>※贊助可留下遊戲ID跟留言.</div>')
            .append('<ul class="sponsor">'+sponsor+'</ul>')
        Box_left_body.append( body_main_donate );

        //
        var about_staff = $('<div class="about_main"></div>')
            .append('<span class="title">站長、程式開發：</span>')
                .append('<span>神偷偷尼</span>')
            .append('<span class="title">資料整理、校對：</span>')
                .append('<span>MustaKissa</span>')
                .append('<span>貓與忘憂草(BlueOcean自由之翼公會長)</span>')
                .append('<span>艾弗蘭栩(BlueOcean百年追求公會長)</span>')
                .append('<span>SnowTung</span>')
                .append('<span>耐特</span>')
                .append('<span>JJWU</span>')
                .append('<span>風清麗霧</span>')
                .append('<span>菲爾斯</span>')
                .append('<span>楚雲</span>')
            .append('<span class="title">地圖整理：</span>')
                .append('<span><a href="https://www.youtube.com/@VtuberYu" target="_blank">游火 ( Yu )</a></span>')
            .append('<span class="title">資料翻譯校對：</span>')
                .append('<span>岬 明乃 (日文)</span>')
                .append('<span>Kidconan (基特柯南_KS Wu) (英文)</span>')
                .append('<span>Unreal (简中)</span>')
                .append('<span>Kawigi (Utopia, Old Sailors Guild)</span>')
            
            .append('<span class="title">特別感謝：</span>')
                .append('<span>還要感謝所有幫忙回報過資料的網友們, 還有很多資料都陸續在整理校正中, 如果願意一起幫忙的朋友也歡迎<a href="mailto:voyage@kctony.com" target="_blank">聯繫我們</a>, 也可以直接回在<a href="https://forum.gamer.com.tw/C.php?bsn=35715&snA=397" target="_blank" style="color: blue;">巴哈討論串</a>下</span>')

        var body_main_about = $('<div id="box_about" class="box staff_main" style="display:none;"></div>')
            .append('<h5>關於大航海旅團</h5>')
            .append('<div class="about_main"><a href="/img/etc/about_voyage.jpg" target="_blank"><img src="/img/etc/about_voyage.jpg"></a>　　【大航海旅團】這個名字是以前玩《大航海時代Online》時跟朋友一起創的商會, 從日版GVO一直玩到台版GVO, 當時也做了個網站, 就是使用現在這個網址, 今年(2023)又一起回來玩《大航海時代：起源》, 因為現有資料都是韓文實在太不方便, 所以又重操舊業了.</div>')
            .append('<h5>參與人員</h5>')
            .append( about_staff )
            .append('<span>　</span>')
            .append('<span>　</span>')
        Box_left_body.append( body_main_about );

    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main donate"></ul>')
        .append( $('<li class="box_donate selected">贊助 voyage.tw</li>').click( function(){ left_menu_select( 'box_donate' ) } ) )
        .append( $('<li class="box_about">關於 voyage.tw</li>').click( function(){ left_menu_select( 'box_about' ) } ) )
    //
    var Box_left = $('#box_left').html('');
        Box_left
            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
            .append( Box_menu )
            .append( Box_left_body )
    //
    left_box_show();
    //
}
function left_menu_select( type ) {
    //
    $('#box_left_menu li').removeClass('selected');
    $('#box_left_menu li.'+type).addClass('selected');
    //
    $('#box_left_body .box').hide();
    $('#box_left_body #'+type).show();
    
}
//
function box_left_pop( type ) {
    type = 'pop';
    //
    var pop_zone_ih_tmp = {};
    var Box_Pop_ul = $('<ul class="pop_ul"></ul>');
    $.each( popular_trade, function( popid, ptarr ) {
        var pop_li = $('<li class="pop_info"></li>');
        var pdd_dark = cache( 'pop_hide_'+popid );
        var pdd = $( lang( popid, ( pdd_dark == '1' ? popid + ' pdd dark' : popid + ' pdd' ) ) ).click(function(){ pop_dark( popid, 'pdd' ) });

        var pop_trade = $('<div class="pop_trade"></div>');
        var tread_list = $('<span class="trades '+ popid +'_pts"></span>');
        $.each( ptarr, function( ptid, pt ) {
            var res_dark = cache( 'pop_hide_'+ptid );
            tread_list.append( $( lang( ptid, ( res_dark == '1' ? ptid + ' pt dark' : ptid + ' pt' ) ) ).click(function(){ pop_dark( ptid, 'pt' ) } ) )
        } )
        pop_trade
            .append( pdd )
            .append( tread_list )
        //
        var pop_zones = $('<ul id="zones_'+ popid +'" class="pop_zones pop_ul" style="'+ ( pdd_dark == '1' ? 'display:none;' : '' ) +'"></ul>');
        var pop_zones_tmp = {};
        $.each( pop_zone, function( zoneid, zonetime ){
            var pop = pop_zone[zoneid];
            if( typeof pop === 'undefined' ) return;
            var iStart = -1;
            var cHour = nHour;
            // 如果delay時間還沒到調整位置
            if( ( ( nMin*60 + nSec ) - pop.d ) < 0 ) {
                iStart += -1;
                //cHour += -1;
            }
            var iEnd = iStart + 23; 
            var li_min = Math.round( pop.d/60 );
            //  li
            for( i=iStart; i<iEnd; i++ ) {
                var pops = popular( pop.z, i );
                if( typeof pop_zone_ih_tmp[zoneid] === 'undefined'     ) pop_zone_ih_tmp[zoneid] = [];
                $.each( pops, function( zi, zpopid ) {
                    if( zpopid != popid ) return;
                    var iH = cHour + i;
                    iH = ( iH + 24 ) % 24;
                    var li_t = add_zero( ( iH < nHour ? iH+24 : iH ) ) +':'+ add_zero( li_min );
                    var li_style = cache( 'zone_hide_' + zoneid ) == '1' ? 'display:none;' : '';
                    var pdd_hm = add_zero( iH ) +':'+ add_zero( li_min );
                    //
                    var li_main = $('<div class=""></div>')
                            .append('<div class="pop_time"><em>'+ add_zero( iH ) +':'+ add_zero( li_min ) +'</em></div>')
                            .append('<div class="pop_zone" data-popid="'+zoneid+'">'+ lang( zoneid ) +'<img class="citygo" src="/img/common/citygo.png" / ></div>')

                    var li_zone = $('<li class="pop_zones_li '+zoneid+'" style="'+li_style+'"></li>')
                        .append( li_main )
                        .on('contextmenu', function(e) { context_menu( e, {'type':'pop', 'zoneid':zoneid, 'popid':zpopid, 'hm':pdd_hm } );return false; })
                    //
                    if( typeof pop_zones_tmp[li_t] === 'undefined' ) pop_zones_tmp[li_t] = [];
                    pop_zones_tmp[li_t].push( li_zone );
                    //
                    if( typeof pop_zone_ih_tmp[zoneid][iH] === 'undefined' ) pop_zone_ih_tmp[zoneid][iH] = $('<div></div>');
                    var zpdd = $( lang( zpopid, ( cache( 'pop_hide_'+zpopid ) == '1' ? zpopid + ' pdd dark' : zpopid + ' pdd' ) ) )
                        .on( 'click', function(){ pzone_go( zoneid );left_box_close(); } )
                    pop_zone_ih_tmp[zoneid][iH].append( zpdd );
                    //
                    $.each( popular_trade[zpopid], function( ptid, pt ) {
                        pop_zone_ih_tmp[zoneid][iH]
                            .append( $( lang( ptid, ( cache( 'pop_hide_'+ptid ) == '1' ? ptid + ' pt dark' : ptid + ' pt' ) ) ) )
                    } )
                } )
            }
        });
        //  按時間排序
        var zone_i = 0;
        $.each( Object.keys( pop_zones_tmp ).sort(), function( i, t ) {
            if( zone_i++ > 20 ) return false;
            pop_zones.append( pop_zones_tmp[t] );
        })
        //
        pop_li
            .append( pop_trade )
            .append( '<div style="clear: both;"></div>' )
            .append( pop_zones )
        //
        Box_Pop_ul.append( pop_li )
    } )
    //  Box_Pop_Table
    var Box_Pop_Table = $('<table class="pop_table"></table>');
    var tr = $('<tr></tr>').append('<th></th>');
    $.each( pop_zone, function( zoneid, zonetime ){
        var th = $('<th class="zone"></th>')
            .append( lang( zoneid ) )
            .attr( 'title', langN( zoneid ) )
            .addClass( zoneid )
            .addClass( cache( 'zone_hide_' + zoneid ) == '1' ? 'hide' : 'show' )
            .on( 'click', function(){ pzone_go( zoneid );left_box_close(); } )
        tr.append( th );
    })
    Box_Pop_Table.append(tr);
    //
    for( i=-1;i<22;i++ ) {
        var ih = (nHour + i)%24;
        if( ih == -1 ) ih = 23;
        var tr = $('<tr></tr>').append('<th class="pop_time"><em>'+add_zero(ih)+':00</em></th>');
        if( ih == nHour ) tr.addClass('nowHour');
        $.each( pop_zone, function( zoneid, zonetime ){
            tr.append( $('<td class="'+zoneid+' '+( cache( 'zone_hide_' + zoneid )=='1'?'hide':'show' )+'"></td>').append( pop_zone_ih_tmp[zoneid][ih] ) );
        })
        Box_Pop_Table.append(tr);
    }
    //
    var Box_left_body = $('<div id="box_left_body" class="box_pop box_body main_scroll" />')
            .append( Box_Pop_ul )
            .append( Box_Pop_Table )
            .append( '<div style="height:30px;"></div>' )
    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main"></ul>');
        var menu_list = '<li data-menu="pop">'+ lang('menu58') +'</li>';
    var Btn_filter = $('<b class="filter"/>').click(function(){ box_tool_pop( 'pop' ) });
    var Btn_wide_mode = $('<b class="btn_wide_mode"><img class="new" src="/img/common/new.png"></b>')
        .on( 'click', function(){
            $('#box_left').toggleClass('wide_mode');
            cache( 'wide_mode', ( $('#box_left').hasClass('wide_mode') ? '1' : '0' ) );
            box_resize();
            nowheel_over = false;
         })
    Box_menu
        .append( menu_list )
        .append( Btn_wide_mode )
        .append( Btn_filter )
    //
    var Box_left = $('#box_left').html('');
        Box_left
            .addClass( cache( 'wide_mode' ) == '1' ? 'wide_mode' : 'def_mode' )
            .append( $('<img class="box_close" src="/img/close_box.jpg" />').on( 'click', function(){ left_box_close() } ) )
            .append( Box_menu )
            .append( Box_left_body )

    $('.pop_zones_li .pop_zone').on( 'click', function() { pzone_go( $(this).data('popid') ) });

    //
    Gtmp['box_left'] = 'pop';
    left_box_show();
}
//
function box_tool_pop( type ) {
    if( type == 'close' ) {
        $('#box_tool').hide();
        Box_Tool_Show = 0;
        Box_Left_Now = '';
        return false;
    }

    //
    var tool_main = $('<ul id="pop_tool_list" class="tool_main main_scroll"></ul>');
    $.each( popular_citys, function( zoneid, pop_citys ){
        //
        var zone_hide = cache( 'zone_hide_' + zoneid );
        tool_main.append( $('<li class="'+( zone_hide=='1'?'hide':'show' )+'" data-zoneid="'+ zoneid +'"><b class="emoji">👁</b>'+ lang( zoneid ) +'</li>')
            .click( function(){
                var res = cache( 'zone_hide_' + zoneid, ( cache( 'zone_hide_' + zoneid )=='1' ? '0' : '1') );
                if( res == '1' ) {
                    $(this).attr( 'class', 'hide' );
                    $('#box_left .pop_zones_li.'+zoneid).hide();
                    $('#box_left .pop_table .'+zoneid).hide();
                    
                }else{
                    $(this).attr( 'class', 'show' );
                    $('#box_left .pop_zones_li.'+zoneid).show();
                    $('#box_left .pop_table .'+zoneid).show();
                }
            })
        )
    })

    //  box_tool
    var Box_tool = $('#box_tool').html('');
    //  Menu
    var Box_tool_menu = $('<ul id="box_tool_menu" class="box_main"></ul>')
            .append( $('<li>'+lang('menu126')+'</li>') )
    //
    Box_tool
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ box_tool_pop('close') } ) )
        .append( Box_tool_menu )
        .append( tool_main )
        .show();
    //
    Box_Tool_Show = 1;
    if( isMobile() ) left2_box_close(); // 防止重疊
    //
    box_resize();
}
//
function box_left_trade( show_tradetype='' ) {
    //
    var Box_left = $('#box_left').html('');
    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main"></ul>');
        var menu_list = '<li data-menu="trade">'+lang('menu130')+'</li>';
    var Btn_filter = $('<b class="filter"/>').click(function(){ box_trade_filter('trade') });
    var Btn_list_mode = $('<b class="btn_list_mode"/>').click(function(){ $('#box_left').toggleClass('list_mode') });
    //
    Box_menu
        .append( menu_list )
        .append( Btn_list_mode )
        .append( Btn_filter )
    Box_left
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
        .append( Box_menu )

    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
    //  船員
    var Box_trade = $('<div id="box_trade" class="box" />');
    var trade_tips = $('<div id="trade_tips" class="box" />');
    var trade_ul = $('<ul class="trades_ul box_main" />');
    var trade_list = '';
    $.each( trades, function( tid, t ) {
        var li_class = ' tradetype'+t.t;
        var trade_pm  = $('<div class="pm"></div>');
        if( typeof tradetype_pm[t.t] !== 'undefined' && typeof t['nlp'] === 'undefined' ) {
            $.each( ['p','m'], function(i,p_m){
                if( typeof tradetype_pm[t.t][p_m] === 'object' ) {
                    var tmp = '';
                    var pm_class = p_m == 'p' ? 'plus ' : 'minus ';
                    $.each( tradetype_pm[t.t][p_m], function( i, pm ){
                        tmp += lang( 'season'+pm, '', '1' ) + ' ';
                        pm_class += pm +' ';
                        li_class += ' '+p_m+'_' + pm;
                    })
                    if( tmp != '' ) trade_pm.append( $('<span class="'+ pm_class +'">'+(p_m=='p'?'▲':'▼')+'</span>').append( tmp ) )
                }
            })
        }
        var trade_city = $('<div class="citys"></div>');
        $.each( t.c, function( i, cityid ){
            var city_now_s = 's'+seasons[json_city[cityid].ss][gMon];
            var city_now_pm = 'n';
            if( typeof tradetype_pm[t.t][city_now_s] !== 'undefined' ) city_now_pm = tradetype_pm[t.t][city_now_s];
            if( typeof t['nlp'] !== 'undefined' ) city_now_pm = 'n';
            //
            trade_city.append('<span class="ccity '+city_now_pm+'" onclick="city_go(\''+ cityid +'\');">'+emoji_pm[city_now_pm]+ lang( cityid ) +'</span>');
        } );
        var ttype = ( t.r == '5' ? '<em>'+lang('menu67')+'</em>' : '' );
        if( t.exc == 'guild') ttype += '<em class="guild">'+lang('menu146')+'</em>';
        if( t.exc == 'zone' ) ttype += '<em class="zone">'+ lang('menu147')+'</em>';
        if( typeof t.boss !== 'undefined' ) ttype += '<em class="job">'+ lang('menu148')+'</em>';

        var list_data = $('<div class="list_data"></div>')
            .append( lang( tid, 'tname' ) )
            .append( '<span class="ttype">'+ ttype + lang( 'tradetype'+t.t, 'tt' ) +'</span>' )
            .append( trade_pm )
            .append( trade_city )
        //
        if( typeof t.exc !== 'undefined' ) {
            li_class += ' exc_'+t.exc;
        } else if( typeof t.boss !== 'undefined' ) {
            li_class += ' exc_job';
        } else {
            li_class += ' exc_no';
        }
        // barter
        if( typeof t.v !== 'undefined' || typeof t.vc !== 'undefined' ) {
            if( typeof t.v !== 'undefined'  ) li_class += ' barter_v';
            if( typeof t.vc !== 'undefined' ) li_class += ' barter_vc';
        } else {
            li_class += ' barter_no';
        }
        //
        var img_new = t.new ? '<img class="new" src="/img/common/new.png" />' : '';
        //
        if( typeof t.r === 'undefined' ) t.r = 4;
        var trades_li = $('<li class="show_light_box light_trade in_left_box '+ tid + li_class +' rank_'+ t.r +'" data-tid="'+tid+'"></li>')
            .append( '<div class="thumb grade_'+ t.r +'"><img class="lazy" data-src="'+ img_src( 'trade', tid ) +'" />'+img_new+'</div>' )
            .append( list_data )
            .click( function(){ trade_info_show( tid ) } )
        //
        trade_ul.append( trades_li );
    })
    //
    Box_trade
        .append( trade_tips )
        .append( trade_ul )
    //
    Box_left_body
        .append( Box_trade )
        .append( '<div style="clear:both; height:50px;" />' )
    //
    Box_left.append( Box_left_body )
    //
    left_box_show();
    //
    if( show_tradetype != '' ) {
        $('.trades_ul li').hide();
        $('.trades_ul li.'+show_tradetype).show();
    }
    //
    $('img.lazy').lazyload( { effect : 'fadeIn' } );

}
function box_trade_filter( type='trade' ) {
    $('#box_trade').attr('class','box');
    $('#box_trade li').show();

    var type_name = '';
    if( type == 'trade' ) {
        type_name = langN('menu131') + ' ' + langN('menu130');
        //  tool_search
        var tool_search = $('<div class="tool_search"></div>').append(
                $('<input type="text" placeholder="'+type_name+'" autocomplete="off" disableautocomplete>')
                .change( function(){
                    var sInput = search_trim( $(this).val() );
                    if( sInput != '' ) {
                        //
                        var tips_h5 = $('<h5 class="clang"></h5>')
                            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ trade_tips_close() } ) )
                            .append( langN('menu131') + '：' + sInput )
                        //
                        $('#trade_tips').html( tips_h5 );
                        //
                        $('#box_left').addClass('list_mode')
                        $('#box_trade li').hide();
                        $('#box_trade').find('li:contains('+ sInput +')').show();
                        //
                        if( sInput[0] == 'd' ) {
                            var safeInput = sInput.replace(/[^a-zA-Z0-9]/g, '');
                            if( safeInput != '' ) $('#box_trade li.'+safeInput).show();
                        }
                    }else{
                        trade_tips_close();
                    }
                } )
            );
        //  tool_main
        var tool_main = $('<div id="tool_main" class="tool_main main_scroll"></div>');
            //  tool_filter_rank
            var tool_filter_rank = $('<div class="filter_main tool_filter_rank"></div>');
                var f_tt = {'5':'menu67','4':'menu132'};
                $.each( ['5','4'], function( i, v ) {
                    tool_filter_rank.append( $('<div class="trade_'+ v +'" data-filter="rank_'+ v +'">'+ lang(f_tt[v]) +'</div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        trade_filter();
                    }) );
                } );
            //  tool_filter_exc
            var tool_filter_exc = $('<div class="filter_main tool_filter_exc"></div>');
                var exc_tt = {'zone':'menu147','guild':'menu146','job':'menu148','no':'menu132'};
                $.each( ['zone','guild','job','no'], function( i, v ) {
                    tool_filter_exc.append( $('<div class="exc_'+ v +'" data-filter="exc_'+ v +'">'+ lang(exc_tt[v]) +'</div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        trade_filter();
                    }) );
                } );
            //  tool_filter_barter
            var tool_filter_barter = $('<div class="filter_main tool_filter_barter"></div>');
                var barter_tt = {'v':'menu179','vc':'menu180','no':'menu119'};
                $.each( ['v','vc','no'], function( i, v ) {
                    tool_filter_barter.append( $('<div class="barter_'+ v +'" data-filter="barter_'+ v +'">'+ lang(barter_tt[v]) +'</div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        trade_filter();
                    }) );
                } );
            //  
            var tool_filter_type = $('<div class="filter_main tool_filter_type"></div>');
                for( i=1 ; i<21 ; i++ ) {
                    var tt = 'tradetype' + add_zero(i);
                    tool_filter_type.append( $('<div class="filter_type" data-filter="'+ tt +'">'+ lang( tt ) +'</div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        trade_filter();
                    }) );
                }
            var tool_filter_type_h6 = $('<h6 class="filter_type_h6">'+lang('menu154')+'</h6>')
                .append( $('<a>'+ lang('menu121') +'</a>').click( function(){ $('.filter_type').toggleClass('filter');trade_filter(); } ) )
            
        tool_main
            .append( '<h6>'+ lang('menu75') +'</h6>' )
            .append( tool_filter_rank )
            .append( '<h6>'+ lang('menu155') +'</h6>' )
            .append( tool_filter_exc )
            .append( '<h6>'+ lang('menu169') +': '+ lang('menu168') +'</h6>' )
            .append( tool_filter_barter )
            .append( tool_filter_type_h6 )
            .append( tool_filter_type )
            
    }
    if( type_name == '' ) return false;

    //  box_tool
    var Box_tool = $('#box_tool').html('');
    //  Menu
    var Box_tool_menu = $('<ul id="box_tool_menu" class="box_main"></ul>')
            .append( $('<li class="'+ ( type=='trade' ? 'selected' :  '' ) +'">'+lang('menu130')+'</li>') )
    //
    Box_tool
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ box_tool_close('trade') } ) )
        .append( Box_tool_menu )
        .append( tool_search )
        .append( tool_main )
        .show();
    //
    Box_Tool_Show = 1;
    if( isMobile() ) left2_box_close(); // 防止重疊
    //
    box_resize();
}
//
function trade_filter() {
    $('#box_trade').attr('class','box');
    $('#box_tool .filter').each(function(){
        var f = $(this).data('filter');
        $('#box_trade').addClass( 'hide_'+f );
    });
}
function trade_tips_close(){
    $('#trade_tips').html('');
    $('#box_trade .em_more').html('').hide();
    $('#box_trade .box_more').html('');
    $('.tool_search input').val('');
    //
    $('#box_trade').removeClass('show_more');
    //
    $('#box_trade li' ).show();
}
//
function trade_info( tid, type='small' ) {
    if( typeof tid === 'undefined' ) return false;
    //  main
    var t = trades[tid];
    if( typeof t === 'undefined' ) return false;
    //
    var light_main = $('<div class="trade_info box_body main_scroll fly_box '+ type +'" />');
        if( type == 'big' ) light_main.append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left2_box_close() } ) )
        if( type =='small') light_main.append( $('<img class="light_info_show" src="/img/common/search2.png" />').click( function(){ trade_info_show( tid ) } ) )
    //
    var trade_pm  = $('<div class="pm"></div>');
    if( typeof tradetype_pm[t.t] !== 'undefined' && typeof t['nlp'] === 'undefined' ) {
        $.each( ['p','m'], function(i,p_m){
            if( typeof tradetype_pm[t.t][p_m] === 'object' ) {
                var tmp = '';
                var pm_class = p_m == 'p' ? 'plus ' : 'minus ';
                $.each( tradetype_pm[t.t][p_m], function( i, pm ){
                    tmp += lang( 'season'+pm, '', '1' ) + ' ';
                    pm_class += pm +' ';
                })
                if( tmp != '' ) trade_pm.append( $('<span class="'+ pm_class +'">'+(p_m=='p'?'▲':'▼')+'</span>').append( tmp ) )
            }
        })
    }
    //
    var tt_id = 'tradetype'+t.t;
    if( typeof t.r == 'undefined' ) t.r = 4;
    var ttype = ( t.r == '5' ? '<em>'+lang('menu67')+'</em>' : '' );
        if( t.exc == 'guild') ttype += '<em class="guild">'+lang('menu146')+'</em>';
        if( t.exc == 'zone' ) ttype += '<em class="zone">'+ lang('menu147')+'</em>';
    var light_main_data = $('<div class="trade_data box_trade"/>')
        .append( '<span class="thumb grade_'+ t.r +'"><img src="'+ img_src( 'trade', tid ) +'" /></span>' )
        .append( '<span class="tname '+tid+'">'+ lang( tid, 'translate' ) +'</span>' )
        .append( '<span class="ttype">'+ ttype + lang( tt_id, 'tt' ) +'</span>' )
        .append( trade_pm )
    // job
    var trade_boss = $('<div></div>');
    if( typeof t.boss !== 'undefined' ) {
        if( typeof job_chars == 'undefined' ) json_get( 'char', function(){ return false } );
        var boss_c = char(t.boss);
        var job_box = $('<div class="trade_boss char"></div>')
                .append('<div class="thumb grade_'+ boss_c.rank +' up_'+ boss_c.up +' '+ t.boss +'" data-charid="'+ t.boss +'"><em class="have '+have( t.boss )+'"></em><em class="type '+boss_c.type+'"></em><img src="'+img_src( 'char', t.boss )+'"></div>')
                .append( lang( t.boss, 'jobc' ) )
                .append( lang( boss_c.job, 'jobt' ) )
        //
        trade_boss
            .append( '<h6>'+ lang('menu148') +'</h6>' )
            .append( job_box )
    }
    //
    var trade_req = $('<div></div>');
    if( typeof t.req !== 'undefined' ) {
        $.each( t.req, function( cityid, tr ){
            if( typeof tr.tip == 'undefined' ) return;
            var reqs = '';
            if( typeof tr.job  !== 'undefined' ) reqs = lang( tr.job ) + ( tr.job_n > 1 ? ' ( '+ tr.job_n +' )' : '' );
            if( typeof tr.boss !== 'undefined' ) reqs = lang( tr.boss );
            if( typeof tr.mem  !== 'undefined' ) reqs = lang( tr.mem ) + ' Lv.'+ tr.mlv;
            if( typeof tr.exc  !== 'undefined' ) reqs = lang( tr.exc );
            if( typeof tr.note !== 'undefined' ) reqs += '<span class="note">'+ tr.note + '</span>';
            //
            trade_req.append( '<div class="trade_req">※ '+ lang( cityid ) +'：' + reqs + '</div>' );
        })
    }

    //  citys / seasons
    var trade_city_div = $('<div></div>');
    if( typeof t.c !== 'undefined' ) {
        var mm_xys = [];
        var trade_city = $('<div class="citys"></div>');
        $.each( t.c, function( i, cityid ){
            var c = json_city[cityid];
            var city_now_s = 's'+seasons[c.ss][gMon];
            var city_now_pm = 'n';
            if( typeof tradetype_pm[t.t][city_now_s] !== 'undefined' ) city_now_pm = tradetype_pm[t.t][city_now_s];
            if( typeof t['nlp'] !== 'undefined' ) city_now_pm = 'n';
            //
            mm_xys.push( {'city':cityid,'cl':'bg_'+city_now_pm} );
            //
            trade_city.append('<span class="ccity '+city_now_pm+'" onclick="city_go(\''+ cityid +'\');">'+emoji_pm[city_now_pm]+ lang( cityid ) +'</span>');
        } );
        //
        var h6 = $('<h6>'+ ( t.exc == 'guild' ? lang('menu149') : lang('menu133') ) +'</h6>')
                 .append( $('<em class="mm emoji">🗺️</em>').click( function(){ minimap( mm_xys ) } ) );
        //
        trade_city_div
            .append( h6 )
            .append( trade_city )
    }
    // village
    var trade_vill_div = $('<div></div>');
    if( typeof t.v !== 'undefined' ) {
        //
        var trade_villages = $('<div class="vills"></div>');
        var i = 0;
        $.each( t.v, function( bid, vid ){
            if( i++ == 0 ) {
                //
                var barter_fri = cache( 'barter_fri', null, {'def':'0.2'} );
                var barter_fris = {'menu174':'0.05','menu178':'0.1','menu170':'0.15','menu175':'0.2'};
                var div_fri = $('<div class="fri"><b>'+lang('menu183', 'translate')+'</b></div>');
                $.each( barter_fris, function( lid, n ){
                    var span = $('<span class="lang span30 '+lid+' translate titop '+( barter_fri == n ? 'selected' : '' )+'" lang="'+lid+'" data-n="'+n+'">'+ langN(lid) +'</span>')
                                .click( function(){ 
                                    cache( 'barter_fri', n );
                                    $('.barter_calc .fri .lang').removeClass('selected');
                                    $('.barter_calc .fri .lang.'+lid).addClass('selected');
                                    barter_db_cal( bid );
                                })
                    div_fri.append( span );
                });
                //
                var div_inv_btn = $('<div class="inv_btn"></div>')
                        .append( '<b>'+lang('menu184', 'translate')+'》</b>' )
                        .click( function(){ box_toggle_click( '.trade_info_more' ); })
                        
                        /*
                var barter_inv = cache( 'barter_inv', null, {'def':'0.2'} );
                var barter_invs = {'menu205':'-0.2','menu204':'-0.1','menu188':'0','menu176':'0.1','menu177':'0.2'};
                $.each( barter_invs, function( lid, n ){
                    var span = $('<span class="lang span30 '+lid+' translate '+( barter_inv == n ? 'selected' : '' )+'" lang="'+lid+'" data-n="'+n+'">'+ langN(lid) +'</span>')
                                .click( function(){
                                    cache( 'barter_inv', n );
                                    $('.barter_calc .inv .lang').removeClass('selected');
                                    $('.barter_calc .inv .lang.'+lid).addClass('selected');
                                    barter_db_cal( bid );
                                })
                    div_inv.append( span );
                });
                */
                //
                var barter_clv = cache( 'barter_clv', null, {'def':'13'} );
                var clv_input = $('<input id="barter_clv" value="'+barter_clv+'">').change( function(){ 
                            cache( 'barter_clv', $(this).val() );
                            barter_db_cal( bid );
                        })
                        .on('keydown', function (e) {
                            var code = e.which || e.keyCode;
                            if( code === 38 ) { $(this).val( $(this).val()*1+1 );cache( 'barter_clv', $(this).val() );barter_db_cal( bid );return false; }
                            if( code === 40 ) { $(this).val( $(this).val()*1-1 );cache( 'barter_clv', $(this).val() );barter_db_cal( bid );return false; }
                        })
                var div_clv = $('<div class="clv"><b>'+lang('menu185', 'translate')+'</b></div>').append( clv_input );
                //
                var barter_dis = cache( 'barter_dis', null, {'def':'0'} );
                var dis_input = $('<input id="barter_dis" value="'+barter_dis+'"><em>％</em>').change( function(){ 
                            cache( 'barter_dis', $(this).val() );
                            barter_db_cal( bid );
                        })
                        .on('keydown', function (e) {
                            var code = e.which || e.keyCode;
                            if( code === 38 ) { $(this).val( $(this).val()*1+1 );cache( 'barter_dis', $(this).val() );barter_db_cal( bid );return false; }
                            if( code === 40 ) { $(this).val( $(this).val()*1-1 );cache( 'barter_dis', $(this).val() );barter_db_cal( bid );return false; }
                        })
                var div_dis = $('<div class="dis"><b>'+ lang('menu208', 'translate') +'</b></div>').append( dis_input );
                //
                var barter_bns = cache( 'barter_bns', null, {'def':'0'} );
                var bns_input = $('<input id="barter_bns" value="'+barter_bns+'"><em>％('+ lang('menu210', 'translate') +')</em>').change( function(){ 
                            cache( 'barter_bns', $(this).val() );
                            barter_db_cal( bid );
                        })
                        .on('keydown', function (e) {
                            var code = e.which || e.keyCode;
                            if( code === 38 ) { $(this).val( $(this).val()*1+1 );cache( 'barter_bns', $(this).val() );barter_db_cal( bid );return false; }
                            if( code === 40 ) { $(this).val( $(this).val()*1-1 );cache( 'barter_bns', $(this).val() );barter_db_cal( bid );return false; }
                        })
                var div_bns = $('<div class="bns"><b>'+ lang('menu209', 'translate') +'</b></div>').append( bns_input );
                //
                var b = barter_arr[bid];
                var Nmax = b.m ? b.m : 100;
                var num_input = $('<input class="barter_num" value="'+ Nmax +'">')
                        .change( function(){ barter_db_cal( bid ); })
                        .on('keydown', function (e) {
                            var code = e.which || e.keyCode;
                            if( code === 38 ) { $(this).val( $(this).val()*1+1 );barter_db_cal( bid );return false; }
                            if( code === 40 ) { $(this).val( $(this).val()*1-1 );barter_db_cal( bid );return false; }
                        })
                        .on('wheel', function (e) {
                            if( e.originalEvent.deltaY > 0 ) {
                                $(this).val( $(this).val()*1-1 ); barter_db_cal( bid );
                            } else {
                                $(this).val( $(this).val()*1+1 ); barter_db_cal( bid );
                            }
                        })

                //
                var barter_sts = cache( 'barter_sts', null, {'def':'menu192'} );
                var div_sts = $('<div class="sts"></div>'); //  <b>'+lang('menu193', 'translate')+'</b>
                $.each( barter_stss, function( lid, n ){
                    var span = $('<span class="lang span30 '+lid+' translate titop '+( barter_sts == lid ? 'selected' : '' )+'" lang="'+lid+'" data-n="'+n+'">'+ langN(lid) +'</span>')
                                .click( function(){
                                    cache( 'barter_sts', lid );
                                    $('.barter_calc .sts .lang').removeClass('selected');
                                    $('.barter_calc .sts .lang.'+lid).addClass('selected');
                                    barter_db_cal( bid );
                                })
                    div_sts.append( span );
                });
                var barter_num_s = '#'+bid+'_calc .barter_num';
                var div_num = $('<div class="num"><b>'+lang('menu186', 'translate')+'</b>')
                        .append( num_input )
                        .append( $('<a href="javascript:void(0);">'+Nmax+'</a>').click( function(){ $(barter_num_s).val( Nmax ); barter_db_cal( bid ); } ) )
                        .append( $('<a href="javascript:void(0);">x2</a>').click( function(){ $(barter_num_s).val( Nmax*2 ); barter_db_cal( bid ); } ) )
                        .append( $('<a href="javascript:void(0);">x3</a>').click( function(){ $(barter_num_s).val( Nmax*3 ); barter_db_cal( bid ); } ) )
                        .append( $('<a href="javascript:void(0);">x4</a>').click( function(){ $(barter_num_s).val( Nmax*4 ); barter_db_cal( bid ); } ) )
                // 數量計算機
                var barter_calc = $('<div id="'+bid+'_calc" class="barter_calc"></div>')
                    .append( div_clv )
                    .append( div_num )
                    .append( div_dis )
                    .append( div_bns )
                    .append( div_fri )
                    .append( div_inv_btn )
                    .append( div_sts )
                    .append( '<div class="cal_res"></div>' )
                //
                var tt_show = {};
                var btt = trades[b.t].t;
                tt_show[btt] = true;   
                $.each( barter_arr[bid].c, function( ctid, tnum ){
                    var ctt = trades[ctid].t;
                    tt_show[ctt] = true;                    
                });
                //  more box
                var trade_more_box = $('<ul class="barter_inv_ul noselect '+ ( box_toggle_cache( 'barter_inv_ul' ) ? '' : 'hide' ) +'"></ul>');
                var barter_invs = { 'menu177':'0.2', 'menu176':'0.1', 'menu188':'0', 'menu204':'-0.1', 'menu205':'-0.2' };
                var barter_inv = cache_kv( bid+'_inv' );
                //  int title
                var div_inv_title = $('<div class="inv div_title"></div>')
                    .append( $(lang('menu184','inv_title'))
                        .click( function(){
                            if( $('.barter_inv_ul').hasClass('hide') ) {
                                $('.barter_inv_ul').removeClass('hide');
                                box_toggle_cache( 'barter_inv_ul', 1 );
                            }else{
                                $('.barter_inv_ul').addClass('hide');
                                box_toggle_cache( 'barter_inv_ul', 0 );
                            }
                        })
                    )
                $.each( barter_invs, function( lid, n ){
                    var span = $( '<span class="span30"><img src="/img/inv_'+ n +'.png" /></span>' )
                        .click( function(){
                            $.each( barter_inv, function( ltt, ln ){
                                barter_inv[ltt] = n;
                            });
                            $('.inv span').removeClass('selected');
                            $('.inv .'+lid).addClass('selected');
                            cacheJ( bid+'_inv', barter_inv );
                            barter_db_cal( bid );
                        })
                    div_inv_title.append( span );
                });
                trade_more_box.append( div_inv_title );
                //
                for(var j=1; j<=20; j++){
                    var ttid = add_zero(j);
                    var div_inv = $('<div class="inv"></div>');
                    $.each( barter_invs, function( lid, n ){
                        if( typeof barter_inv[ttid] == 'undefined' ) barter_inv[ttid] = '0.2';
                        var sttid = ttid;
                        var span = $('<span class="span30 tt'+ttid+' '+lid+' '+( barter_inv[ttid] == n ? 'selected' : '' )+'" data-n="'+n+'" data-ttid="'+ttid+'"><img src="/img/inv_'+ n +'.png" /></span>')
                            .click( function(){ barter_inv_change( bid, sttid, n, lid ) })
                        div_inv.append( span );
                    });
                    var inv_li = $( '<li class="'+ ( tt_show[ttid] ? 'show' : 'fo33' ) +'"></li>' )
                        .append( '<img class="ttimg" src="/img/common/tradetype' + ttid + '.png">' )
                        .append( lang( 'tradetype'+ttid, 'tt_name translate' ) )
                        .append( div_inv )
                    trade_more_box.append( inv_li );
                }
                //  
                //if( Wing ) {
                //}else{
                //    barter_calc = '';
                //}
                if( type == 'big' ) {
                    $('.trade_info_more').html( trade_more_box );
                    if( box_toggle_cache('.trade_info_more') ) $('.trade_info_more').show();
                }
                //
                queue( function(){ barter_db_cal( bid ); } );
                //
                trade_villages
                    .append( barter_calc )
                    .append( barter_db( bid, 'trade_info' ) )
            }
            //
            trade_villages.append('<span class="vill" onclick="barter_go(\''+ vid +'\');"><img class="dimg" src="/img/village.png">'+ lang( vid ) +'</span>');
        } );
        trade_vill_div
            .append( '<h6>'+lang('menu169')+': '+lang('menu179')+'</h6>' )
            .append( trade_villages )
    }
    if( typeof t.vc !== 'undefined' ) {
        var trade_villages = $('<div class="vills"></div>');
        $.each( t.vc, function( vtid, vcarr ){
            var vills = '';
            $.each( vcarr, function( i, vid ) {
                vills += '<span class="vill" onclick="barter_go(\''+ vid +'\');"><img class="dimg" src="/img/village.png">' + lang( vid ) + '</span>';
            });
            var t = trades[vtid];
            var b = barter_arr[Object.keys( t.v )[0]];
            var bf = b.f !== null ? '<b class="bf" lang="'+ b.f +'">'+ langN( b.f ) +'</b>' : '';
                if( typeof b.menu235 != 'undefined' ) bf += '<b class="bf">'+ lang('menu235') +' '+ b.menu235 +'</b>';
                if( typeof b.menu236 != 'undefined' ) bf += '<b class="bf">'+ lang('menu236') +' '+ b.menu236 +'</b>';
                if( typeof b.menu237 != 'undefined' ) bf += '<b class="bf">'+ lang('menu237') +' '+ b.menu237 +'</b>';
                if( typeof b.menu238 != 'undefined' ) bf += '<b class="bf">'+ lang('menu238') +' '+ b.menu238 +'</b>';
            var bs = b.s !== null ? '<b class="bs" lang="'+ b.s +'">'+ langN( b.s ) +'</b>' : '';
            var trade_img = '<span class="thumb grade_'+ ( t.r == 5 ? 5 : 4 ) +'" onclick="trade_info_show(\''+ vtid +'\')"><img src="'+ img_src( 'trade', vtid ) +'" /></span>';
            var trade_name = '<span class="tname" onclick="trade_info_show(\''+ vtid +'\')">'+  bf + bs + lang( vtid, 'translate' ) +'</span>';
            trade_villages.append( '<div class="vtrade">'+trade_img + trade_name + '<div class="vills_main">' + vills +'</div></div>' );
        } );
        trade_villages.append( '<div class="clear"></div>' );
        trade_vill_div
            .append( '<h6>'+lang('menu169')+': '+lang('menu180')+'</h6>' )
            .append( trade_villages )
    }
    //  trade_tbuff 
    var trade_tbuff = $('<div class="trade_buff"></div>');
    var tbuffn = lang(tt_id);
    if( typeof t.t2 !== 'undefined' ) {
        var tbuffs = Object.assign( {}, trade_buff[tt_id], trade_buff[t.t2] );
        if( typeof trade_buff[tid] !== 'undefined' ) tbuffs = Object.assign( {}, trade_buff[tt_id], trade_buff[t.t2], trade_buff[tid] );
        tbuffn += ' ('+lang(t.t2)+')';
    }else{
        var tbuffs = trade_buff[tt_id];
        if( typeof trade_buff[tid] !== 'undefined' ) tbuffs = Object.assign( {}, trade_buff[tt_id], trade_buff[tid] );
    }
    $.each( tbuffs, function( tzone, buff ){
        var tzone_box = $('<div class="zbuff '+(buff>0?'p':'m')+'"></div>')
            .append( '<span class="buff">'+ (buff>0?'+':'') + buff +'%</span>' )
            .append( lang(tzone , 'zone') )
            .click( function(){ tzone_go( tzone ); } )
        trade_tbuff.append( tzone_box );
    })
    //
    var span_note = '';
    if( typeof t.alert !== 'undefined' ) {
        span_note = '<div class="alert">'+ lang( t.alert ) +'</div>';
    }
    //
    light_main
        .append( light_main_data )
        .append( span_note )
        .append( trade_boss )
        .append( trade_city_div )
        .append( trade_req )
        .append( trade_vill_div )
        .append( '<h6>'+ lang('menu134') +': '+ tbuffn +'</h6>' )
        .append( trade_tbuff )

    return light_main;
}
//
function box_left_char( callback ) {
    Box_Left_Now = 'char';
    //
    var Box_left = $('#box_left').html('');
    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main"></ul>');
        var menu_list = '<li data-menu="char">'+ lang('menu26') +'</li>';
    var Btn_filter = $('<b class="filter"/>').click(function(){ box_char_filter('char') });
    var Btn_list_mode = $('<b class="btn_list_mode"/>').click(function(){ $('#box_left').toggleClass('list_mode') });
    //
    Box_menu
        .append( menu_list )
        .append( Btn_list_mode )
        .append( Btn_filter )
    Box_left
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
        .append( Box_menu )

    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
    //  船員
    var Box_char = $('<div id="box_char" class="box" />');
    var char_tips = $('<div id="char_tips" class="box" />');
    var char_ul = $('<ul class="box_main" />');
        var char_list = '';
        var char_arr = {};
        // first time load cache
        var char_load = ( typeof Gtmp['load_char_cache'] == 'undefined' );
        Gtmp['load_char_cache'] = true;
        //
        $.each( json_char, function( charid, c ) {
            if( char_load ) c = char( charid ); // first time load cache
            if( c.note == 'hidden' ) return;
            //
            var cfilter = '';
            // skill
            $.each( c.skill, function( skg, skr ) {
                $.each( skr, function( skid, lv ) {
                    lv = lv !== null ? lv : 1;
                    if( typeof skill_chars[skid] === 'undefined' ) skill_chars[skid] = {};
                    if( typeof skill_chars[skid][charid] === 'undefined' ) {
                        skill_chars[skid][charid] = lv;
                    }else{
                        if( skill_chars[skid][charid] < lv ) skill_chars[skid][charid] = lv;
                    }
                    cfilter += skid + ' ';
                });
            });
            // lang
            var span_lang = '';
            $.each( c.lang, function( la, lv ){
                if( typeof lang_chars[la] === 'undefined' ) lang_chars[la] = {};
                if( typeof lang_chars[la][charid] === 'undefined' ) lang_chars[la][charid] = {};
                lang_chars[la][charid] = lv;
                cfilter += ' lang_' + la + ' ';
                span_lang  += '<span class="clang"><b>Lv'+ lv +'</b>'+ lang( la ) +'</span>';
            } );
            //
            var img_new = c.new ? '<img class="new" src="/img/common/new.png" />' : '';
            if( c.boss ) c.rank = 6;
            //
            char_arr[charid] = '';
            char_list
               += '<li class="char_box char '+ charid +' rank_'+ c.rank +' '+c.type+' gender_'+c.gender+' gou_'+have( charid )+' '+ cfilter +'">'
                    +'<div class="thumb in_left_box grade_'+ c.rank +' up_'+ c.up +' '+ charid +'" data-charid="'+ charid +'">'
                        +'<em class="have '+have( charid )+'"></em>'
                        +img_new
                        +'<em class="type '+c.type+'"></em>'
                        +'<em class="em_more"></em>'
                        +'<em class="em_lv"></em>'
                        +'<img class="lazy" data-src="'+img_src( 'char', charid )+'">'
                        +'<div class="list_data">'
                            +'<div class="char_info_show" data-charid="'+ charid +'"><img src="/img/common/search2.png" /></div>'
                            +lang( charid, 'name' )
                            +lang( c.job, 'job' )
                            +'<span class="langs">'+ span_lang +'</span>'
                            +'<div class="box_more"></div>'
                        +'</div>'
                    +'</div>'
                +'</li>';
        })
        char_ul.html( char_list );
    //
    $(char_ul).on( 'click', '.char_info_show', function(e){
        e.preventDefault();
        char_info_show( $(this).data('charid') );
        return false;
    } );
    //
    Box_char
        .append( char_tips )
        .append( char_ul )
    Box_left_body.append( Box_char );

    //
    Box_left_body.append( '<div style="clear:both; height:50px;" />' )
    Box_left.append( Box_left_body )
    //
    left_box_show();
    //
    $('img.lazy').lazyload( { effect : 'fadeIn' } );
    //
    if( typeof callback == 'function' ) callback();
}
//
function box_left_box( callback ) {
    //
    var Box_left_body = $('<div id="box_left_body" class="box_body main_scroll" />');
    //  Menu
    var Box_menu = $('<ul id="box_left_menu" class="box_main"></ul>');
    //
    var Box_left = $('#box_left').html('');
        Box_left
            .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left_box_close() } ) )
            .append( Box_menu )
            .append( Box_left_body )
    //
    left_box_show();
    //
    if( typeof callback == 'function' ) callback();
}
function count_tool_skill( type='def' ) {
    //
    for(var i=1; i<=23; i++){
        var skt = 'menuskt'+i;
        var skt_count = '';
        $('.h6_'+skt).show()
        if( type == 'def' ) skt_count = $('#'+skt+'_main li').length;
        if( type == 'search' ) {
            skt_count = $('#'+skt+'_main li:visible').length;
            if( skt_count == 0 ) $('.h6_'+skt).hide()
        }
        $('.h6_'+skt+' em').html( skt_count );
    }
    //  $('.h6_skt1 em').html( $('#skt1_main li').length );
}
//
function box_char_filter( type='char' ) {
    $('#box_char').attr('class','box');
    $('#box_char li').show();

    var type_name = '';
    if( type == 'skill' ) {
        type_name = langN('menu131') + ' ' + langN('menu54');
        //  tool_search
        var tool_search = $('<div class="tool_search"></div>').append(
                $('<input type="text" placeholder="'+type_name+'" autocomplete="off" disableautocomplete>')
                .change( function(){
                    var sInput = search_trim( $(this).val() );
                    if( sInput != '' ) {
                        $('.tool_main ul').show();
                        $('.tool_main .h5_btn b').attr('class','hide');
                        $('.tool_main li').hide();
                        $('.tool_main').find('li:contains('+ sInput +')').show();
                        count_tool_skill('search');
                    }else{
                        $('.tool_main ul').hide();
                        $('.tool_main .h5_btn b').attr('class','show');
                        $('.tool_main li').show();
                        count_tool_skill('def');
                        //$('.tool_main h6 em').html('');
                    }
                } )
            );
        //  skill
        var skill_ul = {};
        $.each( skill_arr, function( skid, sk ) {
            var ulid = sk.t +'_main';
            if( typeof skill_ul[sk.t] === 'undefined' ) skill_ul[sk.t] = $('<ul id="'+ ulid +'"></ul>');
            if( cache( 'box_hide.'+ ulid, null, {'def':'1'}  ) == '1' ) skill_ul[sk.t].css({'display':'none'});
            var span_more = sk.msk === 1 ? lang('menu217', 'span_msk') : '';
            skill_ul[sk.t].append(
                $('<li class="'+ skid + ( sk.msk === 1 ? ' msk' : '' ) +'" data-skid="'+ skid +'"></li>')
                    .append( lang( skid ) + span_more )
                    .click( function(e){ select_skill( skid ) })
            )
        })
        //
        var tool_main = $('<div id="skill_list" class="tool_main main_scroll" />');
        for(var i=1; i<=23; i++){
            var skt = 'menuskt'+i;
            tool_main
                .append('<h6 class="h5_btn h6_'+ skt +'" data-bid="'+ skt +'_main"><b class="'+ ( cache( 'box_hide.'+ skt +'_main' )==1?'show':'hide') +'"></b>'+ lang( skt, 'translate' ) +' <em></em></h6>')
                .append( skill_ul[skt] );
        }
    }
    if( type == 'lang' ) {
        type_name = langN('menu131') + ' ' + langN('menu55');
        //  tool_search
        var tool_search = $('<div class="tool_search" />').append(
                $('<input type="text" placeholder="'+type_name+'" autocomplete="off" disableautocomplete>')
                .change( function(){
                    var sInput = search_trim( $(this).val() );
                    if( sInput != '' ) {
                        $('.tool_main li').hide();
                        $('.tool_main').find('li:contains('+ sInput +')').show();
                    }else{
                        $('.tool_main li').show();
                    }
                } )
            );
        //  lang
        var tool_main = $('<ul id="lang_list" class="tool_main main_scroll"></ul>');
        for(var i=1; i<37; i++){
            langid = 'lang'+i*10;
            tool_main.append( $('<li class="lang_'+ langid +'" data-langid="'+ langid +'">'+ lang( langid ) +'</li>')
                .click( function(e){ select_lang( $(this).data('langid') ) })
            )
        }
    }
    if( type == 'job' ) {
        type_name = langN('menu131') + ' ' + langN('menu66');
        //  tool_search
        var tool_search = $('<div class="tool_search" />').append(
                $('<input type="text" placeholder="'+type_name+'" autocomplete="off" disableautocomplete>')
                .change( function(){
                    var sInput = search_trim( $(this).val() );
                    if( sInput != '' ) {
                        $('.tool_main li').hide();
                        $('.tool_main').find('li:contains('+ sInput +')').show();
                    }else{
                        $('.tool_main li').show();
                    }
                } )
            );
        //  job
        var tool_main = $('<ul id="job_list" class="tool_main main_scroll"></ul>');
        $.each( job_chars, function( jobid, arr ) {
            tool_main.append( $('<li class="'+ jobid +'" data-jobid="'+ jobid +'">'+ lang( jobid ) +'</li>')
                .click( function(e){ char_search_txt( langN( $(this).data('jobid') ) ) })
            )
        });
    }
    if( type == 'char' ) {
        type_name = langN('menu131') + ' ' + langN('menu26');
        //  tool_search
        var tool_search = $('<div class="tool_search"></div>').append(
                $('<input type="text" placeholder="'+type_name+'" autocomplete="off" disableautocomplete>')
                .change( function(){
                    var sInput = search_trim( $(this).val() );
                    if( sInput != '' ) {
                        char_search_txt( sInput );
                    }else{
                        char_tips_close();
                    }
                } )
            );
        //  tool_main
        var tool_main = $('<div id="tool_main" class="tool_main main_scroll"></div>');
            //  tool_filter_rank
            var tool_filter_rank = $('<div class="filter_main tool_filter_rank"></div>');
                $.each( [6,5,4,3,2], function( i, v ) {
                    tool_filter_rank.append( $('<div class="thumb grade_'+ v +'" data-filter="rank_'+ v +'"></div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        char_filter();
                    }) );
                } );
            //  tool_filter_class
            var tool_filter_class = $('<div class="filter_main tool_filter_class char"></div>');
                $.each( [1,2,3], function( i, v ) {
                    tool_filter_class.append( $('<div class="type class_'+ v +'" data-filter="class_'+ v +'"></div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        char_filter();
                    }) );
                } );
            //  tool_filter_gou
            var tool_filter_gou = $('<div class="filter_main tool_filter_gou char"></div>');
                $.each( ['gou',''], function( i, v ) {
                    tool_filter_gou.append( $('<div class="filter_gou" data-filter="gou_'+ v +'"><span class="have gou_'+ v +'"></span></div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        char_filter();
                    }) );
                } );
            //  tool_filter_gender
            var tool_filter_gender = $('<div class="filter_main tool_filter_gender char"></div>');
                $.each( ['m','f'], function( i, v ) {
                    tool_filter_gender.append( $('<div class="filter_gender" data-filter="gender_'+ v +'"><span class="gender gender_'+ v +'"></span></div>').click(function(){
                        if( $(this).hasClass('filter') ) { $(this).removeClass('filter') }else{ $(this).addClass('filter') }
                        char_filter();
                    }) );
                } );
                
        tool_main
            .append( '<h6>'+ lang('menu75') +'</h6>' )
            .append( tool_filter_rank )
            .append( tool_filter_class )
            .append( tool_filter_gender )
            .append( tool_filter_gou )
            
    }
    if( type_name == '' ) return false;

    //  box_tool
    var Box_tool = $('#box_tool').html('');
    //  Menu
    var Box_tool_menu = $('<ul id="box_tool_menu" class="box_main"></ul>')
            .append( $('<li class="'+ ( type=='char' ? 'selected' :  ''  ) +'">'+ lang('menu26') +'</li>').click( function(){ box_char_filter( 'char' ) } ) )
            .append( $('<li class="'+ ( type=='skill' ? 'selected' :  '' ) +'">'+ lang('menu54') +'</li>').click( function(){ box_char_filter( 'skill' ) } ) )
            .append( $('<li class="'+ ( type=='lang'  ? 'selected' :  '' ) +'">'+ lang('menu55') +'</li>').click( function(){ box_char_filter( 'lang' ) } ) )
            .append( $('<li class="'+ ( type=='job'  ? 'selected' :  ''  ) +'">'+ lang('menu66') +'</li>').click( function(){ box_char_filter( 'job' ) } ) )
    //
    tool_main.append( '<div style="clear:both; height:20px;" />' )
    Box_tool
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ box_tool_close('char') } ) )
        .append( Box_tool_menu )
        .append( tool_search )
        .append( tool_main )
        .show();
    //
    if( type == 'skill' ) count_tool_skill('def');
    //
    Box_Tool_Show = 1;
    if( isMobile() ) left2_box_close(); // 防止重疊
    //
    box_resize();
}
//
function char_filter() {
    $('#box_char').attr('class','box');
    $('#box_tool .filter').each(function(){
        var f = $(this).data('filter');
        $('#box_char').addClass( 'hide_'+f );
    });
}

//
function map_show( key, selecter ) {
    $(selecter).toggle( ( cache( key, null, {'def':'1'} ) == '1' ) );
}

//
function box_tool_close( type ) {
    $('#box_tool').hide();
    Box_Tool_Show = 0;
    Box_Left_Now = '';

    if( type == 'char' ) {
        $('#box_char').attr('class','box');
        $('#box_char li').show();
        char_tips_close();
    }
}
//
function box_tool_toggle( type ) {
    $('#box_char').attr('class','box');
    $('#box_char li').show();
    //
    if( type == 'close' || $('#box_tool').css('display') == 'block' ) {
        $('#box_tool').hide();
        char_tips_close();
        Box_Tool_Show = 0;
        Box_Left_Now = '';
        return false;
    }
    //
    box_char_filter( type );
}
//
function trade_info_show( tid ) {
    Box_Left2_Show = 1;
    $('#light_box').hide();
    $('#box_left2').html('')
        .append('<div class="left2_more trade_info_more nowheel"></div>')
        .append( trade_info( tid, 'big' ) )
        .show();
    //
    box_resize();
}
//
function quest_info_show( qid ) {
    Box_Left2_Show = 1;
    $('#light_box').hide();
    $('#box_left2').html( quest_info( qid, 'big' ) ).show();
    //
    box_resize();
}
//
function char_info_show( charid ) {
    if( typeof json_char === 'undefined' ) return $.loadScript('/js/json_char.js?v='+ver, function(){ char_info_show( charid ); });
    Box_Left2_Show = 1;
    $('#light_box').hide();
    $('#box_left2').html( char_info( charid, 'big' ) ).show();
    //
    box_resize();
}
function left2_box_close() {
    Box_Left2_Show = 0;
    $('#box_left2').fadeOut();
    //
    box_resize();
}
function left_box_show() {
    Box_Left_Show = 1;
    $('#box_left').animate({ left: 0, opacity: 1 }, 300 ).animate({ height: ( $(window).height() - 40 )}, 500);
    //
    box_resize();
}
function left_box_close() {
    Gtmp['box_left'] = '';
    url_hash( 'm', '' );
    Box_Left_Show = 0;
    $('#box_left').data('menu', '').removeClass('list_mode').html('');;
    $('#lt_menu .menu_btn').removeClass('selected');
    $('#box_left').animate({ height: 0}, 200).animate({ left: -360, opacity: 0 }, 300 );
    //
    Box_Tool_Show = 0;
    Box_Left_Now = '';
    $('#box_tool').hide();
    //
    box_resize();
}
function right_box_close() {
    CityNow = '';
    url_hash( 't', '' );
    Box_Right_Show = 0;
    $('.city.selected').removeClass('selected');
    $('#city_there').hide();
    $('#box_right').animate({ right: -300, opacity: 0 }, 500 );
    $('#babala').animate({ right: 0 }, 500 ).removeClass('have_right');;
}
function char_tips_close(){
    $('#char_tips').html('');
    $('#box_char .em_more').html('').hide();
    $('#box_char .em_lv').html('').hide();
    $('#box_char .box_more').html('');
    $('.tool_search input').val('');
    //
    $('#box_char').removeClass('show_more');
    //
    $('#box_char li' ).show();
}
// 
function box_toggle_click( selecter, toggle=null ) {
    if( $(selecter).is(":hidden") ) {
        $(selecter).show();
        box_toggle_cache( selecter, 1 );
    }else{
        $(selecter).hide();
        box_toggle_cache( selecter, 0 );
    }
}
function box_toggle_cache( k, up=null ) {
    if( up === null ) {
        var res = cache_kv( 'box_toggle', k );
        if( typeof res == 'undefined' ) res = 1;
        return res;
    }
    cache_kv( 'box_toggle', k, up );
}
//
function box_resize() {
    var wH = $(window).height();
    var left_top = $('#box_left').offset().top;
    var left_width = $('#box_left').width();
    var left2_top = left_top;
    var left2_left = left_width + 5;
    var tool_top = left_top + 40;
    var tool_left = left_width + 5;
    var tool_height = wH - 100;
    var max_height = wH - 80;

    //
    if( Box_Left_Show == 1 ) $('#box_left .main_scroll').not('.scroll-wrapper').scrollbar();
    if( Box_TodoList_Show == 1 ) $('#todo_list').animate({ 'left': ( Box_Left_Show == 1 ? left2_left : 5 ) });
    
    if( Box_Left_Show == 0 ) left2_left = 0;
    if( Box_Left2_Show == 1 ) {
        $('#box_left2').animate({'top':left2_top, 'left':left2_left,'max-height':max_height});
        $('#box_left2 .main_scroll').not('.scroll-wrapper').scrollbar();
    }
    if( Box_Tool_Show == 1 ) {
        if( Box_Left2_Show == 1 ) {
            tool_top = left2_top + $('#box_left2').height() + 5;
            tool_height = wH - $('#box_left2').height() - 45;
        }
        $('#box_tool').animate({ 'top': tool_top, 'left':left2_left, 'height': tool_height });
        $('#box_tool .tool_main').not('.scroll-wrapper').scrollbar();
        $('#box_tool .tool_main').css({ 'height': ( tool_height - 60 ), 'max-height': ( tool_height - 60 )});
    }
}
//  esc close
function esc_close() {
    $('#light_box').hide();
    if( $('#report_box').css('display') !== 'none' ) return $('#report_box .box_close').click();
    if( Box_Report_Show == 1 ) return box_report_close();
    if( Box_Search_Show == 1 ) return $('.search_btn').click();
    if( Box_Tool_Show == 1 ) return box_tool_close();
    if( Box_Left2_Show == 1 ) return left2_box_close();
    if( Box_Left_Show == 1 ) return left_box_close();
    if( Box_Right_Show == 1 ) return right_box_close();
    return $('#lt_menu .btn0').click();
}
//
function select_lang( langid ) {
    if( typeof langid === 'undefined' ) return false;
    //
    var tips_h5 = $('<h5 class="clang"></h5>')
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ char_tips_close() } ) )
        .append( lang( langid, 'clang' ) )
    //
    $('#char_tips').html( tips_h5 );
    //
    $('.tool_main li').removeClass('selected');
    $('.tool_main li.lang_'+langid ).addClass('selected');
    //
    $('#box_char').removeClass('show_more');
    $.each( lang_chars[langid], function( charid, charlv ) {
        $('.'+charid+' .em_more').html( charlv ).show();
    });
    //
    $('#box_char li' ).hide();
    $('#box_char .lang_'+langid ).show();
}
//
function char_search_txt( txt ) {
    if( typeof txt === 'undefined' ) return false;
    var tips_h5 = $('<h5 class="clang"></h5>')
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ char_tips_close() } ) )
        .append( langN('menu131') + '：' + txt )
    //
    $('#char_tips').html( tips_h5 );
    //
    $('#box_left').addClass('list_mode')
    $('#box_char li').hide();
    $('#box_char').find('li:contains('+ txt +')').show();
}

//
var select_skid = '';
function select_skill( skid ) {
    if( Box_Left_Show !== 1 || Box_Left_Now !== 'char' ) {
        select_skid = skid;
        json_get( 'char', function(){ box_left_char( function(){ select_skill() } ); } );
        return false;
    }
    if( typeof skid === 'undefined' ) skid = select_skid;
    if( typeof skill_arr[skid] !== 'undefined' && typeof skill_arr[skid].i !== 'undefined' ) imgid = skill_arr[skid].i;
    var span_more = skill_arr[skid].msk === 1 ? lang('menu217', 'span_msk translate') : '';
    //  noteD
    var noteD = $('<div></div>');
    var des_tr = '';
    if( typeof skill_arr[skid] !== 'undefined' && skill_arr[skid].d != null && skill_arr[skid].d.length > 1 ) {
        var des_0 = langN( skid+'des' );
        var desD_arr_0 = skill_arr[skid].d[0];
        $.each( skill_arr[skid].d, function( di, des_arr ) {
            var tmp_des = des_0.replaceAll( '%', '％' );
            $.each( desD_arr_0, function( ddi, dd ) {
                dd1 = dd.replaceAll( '%', '％' )
                tmp_des = tmp_des.replace( dd1, emoji_h[ddi] );
            })
            $.each( desD_arr_0, function( ddi, dd ) {
                dd2 = des_arr[ddi].replaceAll( '%', '％' )
                tmp_des = tmp_des.replace( emoji_h[ddi], '<b>'+dd2+'</b>' );
            })
            des_tr += '<tr><td class="lv">Lv.'+ (di+1) +'</td><td class="des">'+ tmp_des +'</td></tr>';
        });
        noteD
            .append( $('<span class="moreD">▼</span>').click(function(){ $('table.noteD').slideToggle() }) )
            .append( '<table class="noteD">'+ des_tr +'</table>' )
    }
    //
    //if( skill_arr[skid].msk === 1 && skill_arr[skid].t == 'menuskt1' ) {
    //    noteD.append( '<div style="color: red;background: yellow;">'+ lang('menu222') +'</div>' );
    //}
    //
    var tips_h5 = $('<h5 class="skill"></h5>')
        .append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ char_tips_close() } ) )
        .append('<img src="'+img_src( 'skill', skid )+'" />')
        .append( lang( skid, 'name translate' ) + span_more )
        .append('<br />'+ lang( skid+'des', 'des translate' ) )
        .append( noteD )
    //
    $('#char_tips').html( tips_h5 );
    //
    $('.tool_main li').removeClass('selected');
    $('.tool_main li.'+skid ).addClass('selected');
    //
    $('#box_char').addClass('show_more');
    $.each( skill_chars[skid], function( charid, charlv ) {
        var c = char(charid);
        $('.'+charid+' .em_more').html( charlv ).show();
        if( typeof c['slv'] !== 'undefined' && typeof c['slv'][skid] !== 'undefined' ) {
            $('.'+charid+' .em_lv').html( 'Lv.'+c['slv'][skid] ).show();
        }else{
            $('.'+charid+' .em_lv').hide();
        }
        $('.'+charid+' .box_more').html( '<div class="char_skill"><img src="'+img_src( 'skill', skid )+'" /> '+ lang( skid, 'lname' ) +'<br />Lv.' + charlv + '');
    });
    //
    $('#box_char li' ).hide();
    $('#box_char .'+skid ).show();
}
//  
function have( key, up=false ) {
    if( typeof key_change[key] !== 'undefined' ) key = key_change[key];
    var key = 'have.' + key;
    if( up == 'gou'  ) return cache( key, 'gou' );
    if( up == 'nogou') return cache( key, '' );
    var res = cache( key, null, {'def':''} );
    if( up !== true ) return res;
    // 更新
    return cache( key, ( res == 'gou' ? '' : 'gou' ) );
}
//
function char_info( charid, type='small' ) {
    if( typeof charid === 'undefined' ) return false;
    //  main
    var c = char(charid);
    //
    var span_lang = '';
        $.each( c.lang, function( la, lv ){
            span_lang  += '<span class="clang"><b>Lv'+ lv +'</b>'+ lang( la, 'translate' ) +'</span>';
        } );
    //
    var span_note = '';
    if( typeof c.note !== 'undefined' ) {
        if( c.note.indexOf('202') === 0 ) span_note = lang( 'menu211', 'translate' ) + '：';
        span_note += lang( c.note );
        span_note = '<div class="alert">'+ span_note +'</div>';
    }
    //
    var span_req = '';
    if( c.req !== '' && langN( c.req,'') != '' ) {
        span_req = $('<div class="req char" />');
        if( typeof c.req_char !== 'undefined' && c.req_char != '' ) {
            var req_id = c.req_char;
            var req_c = char(req_id);
            span_req.append('<div class="thumb grade_'+ req_c.rank +' up_'+ req_c.up +' '+ req_id +'" data-charid="'+ req_id +'"><em class="have '+have( req_id )+'"></em><em class="type '+req_c.type+'"></em><img src="'+img_src( 'char', req_id )+'"></div>');
        }
        span_req.append( lang( c.req, 'translate' ) );
    }
    var span_char_reqs = '';
    if( typeof c.char_reqs !== 'undefined' && c.char_reqs != '' ) {
        span_char_reqs = $('<div class="char_reqs" />');
        $.each( c.char_reqs, function( i, crid ) {
            var rc = char(crid);
            if( rc.note == 'hidden' ) return;
            span_char_reqs.append('<div class="char '+ crid +'"><span class="thumb grade_'+ rc.rank +' up_'+ rc.up +'" data-charid="'+ crid +'"><em class="have '+have( crid )+'"></em><em class="type '+rc.type+'"></em><img src="'+img_src( 'char', crid )+'"></span></div>');
        } )
    }
    var span_citys = '';
    var mm_xys = [];
    if( c.city.length != 0 && c.city[0] != '' ) {
        $.each( c.city, function( i, cityid ){
            mm_xys.push( {'city':cityid} );
            span_citys += '<span class="ccity" onclick="city_go(\''+ cityid +'\');">'+ lang( cityid ) +'</span>';
        } );
        span_citys = '<div class="citys">'+ span_citys +'</div>';
    }
    var span_needs = '';
    if( typeof c.first !== 'undefined' ) {
        var needs = '';
        $.each( char_first[c.first] , function( i, needid ){
            var c2 = char(needid);
            if( typeof c2 === 'undefined' ) return;
            if( type == 'big' ) {
                if( [1,2,3,5,6,7].indexOf(i) !== -1 ) needs += '<div class="bg1"><img src="/img/common/need1.png" /></div>';
                if( i == 4 ) needs += '<b class="bg2"></b>';
            }
            needs += '<div class="char '+ needid +'"><span class="thumb grade_'+ c2.rank +' up_'+ c2.up +' need'+ i +'" data-charid="'+ needid +'"><em class="have '+have( needid )+'"></em><em class="type '+c2.type+'"></em><img src="'+img_src( 'char', needid )+'"></span></div>';
        } )
        span_needs = $('<div class="needs" />');
        span_needs.append( needs );
    }
    var span_skill = '';
    $.each( c.skill, function( skg, skr ){
        $.each( skr, function( skid, lv ){
            lv = lv !== null ? lv : 1;
            slv = '';
            if( typeof c['slv'] !== 'undefined' ) {
                if( typeof c['slv'][skid] !== 'undefined' ) slv = '<em class="slv">Lv.'+ c['slv'][skid] +'</em>';
            }
            if( typeof skill_arr[skid] == 'undefined' ) skid = 0;
            span_skill += '<span class="skill '+ skg +'">'
                + '<em>'+ lv +'</em>'
                + slv
                + '<img src="'+img_src( 'skill', skid )+'" title="'+ lang(skid, '', 'nospan') +'" onclick="select_skill(\''+ skid +'\')">'
            + '</span>';
        } )
    } );
    //
    var light_main = $('<div class="char_info box_body main_scroll '+ type +'" />');
        if( type == 'big' ) light_main.append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left2_box_close() } ) )
        if( type =='small') light_main.append( $('<img class="light_info_show" src="/img/common/search2.png" />').click( function(){ char_info_show( charid ) } ) )

        var char_up_input = $('<div class="'+charid+' char_up"></div>')
                .append( ( c.up == '7' ? '<em class="have gou"></em>' : '' ) )
                .click( function(){
                    var up = char(charid,'up', ( char(charid).up == '7' ? '0' : '7' ) );
                    if( up == '7' ) {
                        $('.'+charid+'.char_up').html( '<em class="have gou"></em>' );
                        $('.'+charid+'.thumb').addClass('up_7');
                    }else{
                        $('.'+charid+'.char_up').html( '' );
                        $('.'+charid+'.thumb').removeClass('up_7');
                    }
                } )
        light_main.append( char_up_input );

        var light_main_data = $('<div class="char_data char"/>')
                .append('<div class="thumb grade_'+ c.rank +' up_'+ c.up +' '+ charid +' nolight" data-charid="'+ charid +'"><em class="have '+have( charid )+'"></em><em class="type '+c.type+'"></em><img src="'+img_src( 'char', charid )+'"></div>')
                .append('<div class="name">'+ lang( charid ,'translate' ) +'</div>')
                .append('<div class="job">'+ lang( c.job, 'translate' ) +'</div>')
                .append('<div class="langs">'+ span_lang +'</div>')
        light_main.append( light_main_data );

        light_main.append( span_note );
        if( type == 'big' && span_req !== '' ) light_main.append('<h6>'+lang('menu44')+'</h6>');
        if( span_req != '' ) light_main.append( span_req );
        if( type == 'big' && span_char_reqs !== '' ) light_main.append('<h6>'+lang('menu43')+' '+lang('menu14')+'</h6>');
        if( span_char_reqs != '' ) light_main.append( span_char_reqs );

        if( type == 'big' && span_citys !== '' ) {
            var h6 = $('<h6>'+lang('menu13','translate')+'</h6>')
                     .append( $('<em class="mm emoji">🗺️</em>').click( function(){ minimap( mm_xys ) } ) );
            light_main.append( h6 );
        }
        if( span_citys != '' ) light_main.append( span_citys );

        if( type == 'big' && span_needs !== '' ) light_main.append('<h6>'+lang('menu14')+'</h6>');
        if( span_needs != '' ) light_main.append( span_needs );

        if( type == 'big' ) light_main.append('<h6>'+lang('menuskg0')+'/'+lang('menu15')+'</h6>');
        light_main.append( '<div class="skills">'+ span_skill +'</div>' );

    return light_main;
}
//
function item_box( item_id, item_num=1 ) {
    var item = items[item_id];
    var item_main = $('<div class="item_main"></div>')
        .append( lang( item_id, 'iname' ) )
        .append( lang( item.t, 'itype' ) )
    // attr
    $.each( [6,7,8,9], function(i,t){
        if( typeof item[t] === 'undefined' ) return;
        $.each( item[t], function(k,v){
            item_main.append( '<span class="attr"><span>'+ lang(k) +'</span><em>'+ v +'</em></span>' );
        } )
    } )
    //
    var item_box = $('<div class="item_box"></div>')
        .append( '<span class="thumb grade_'+ item.r +'"><img class="item" src="/img/item/uwo_'+ item_id +'.png"><em>'+ item_num +'</em></span>' )
        .append( item_main )
    return item_box;
}
//
function qstep_trade_more( tid, q=0, type='small' ) {
    var tt = $('<span></span>').append( ' '+lang( tid ) ).append( (q > 0 ? ' ('+q+')' : '') );
    if( type == 'small' ) {
        tt.append( $('<img class="gett_more" src="/img/common/search2.png">').click(function() { $('.light_info_show').click() } ) );
    }else{
        tt.append( $('<img class="gett_more show_light_box light_trade" src="/img/common/search2.png" data-tid="'+tid+'">').click(function() {
            } ) );
    }
    return tt;
}

//
function quest_info( qid, type='small' ) {
    if( typeof qid === 'undefined' ) return false;
    //  main
    var q = quests[qid];
    //
    var light_main = $('<div class="quest_info box_body main_scroll '+ type +'" />');
        if( type == 'big' ) light_main.append( $('<img class="box_close" src="/img/close_box.jpg" />').click( function(){ left2_box_close() } ) )
        if( type =='small') light_main.append( $('<img class="light_info_show" src="/img/common/search2.png" />').click( function(){ quest_info_show( qid ) } ) )
        //
        var quest_req = '';
        if( q.type == 'bar' || q.type == 'union' ) {
            var rev_lv = '<span class="req req_lv">'+ lang('menu78')+' Lv.'+ q.lvg + ( q.lvg != q.lvp ? ' ('+ lang('menu111')+'.'+ q.lvp +')' : '' ) +'</span>';
            var qneed = '';
                if( typeof q.menu79 != 'undefined' ) qneed += '<div class="req_main">'+ lang('menu79') + ' ' + q.menu79 + '</div>';
                if( typeof q.menu80 != 'undefined' ) qneed += '<div class="req_main">'+ lang('menu80') + ' ' + q.menu80 + '</div>';
                if( typeof q.menu81 != 'undefined' ) qneed += '<div class="req_main">'+ lang('menu81') + ' ' + q.menu81 + '</div>';
                if( typeof q.menu82 != 'undefined' ) qneed += '<div class="req_main">'+ lang('menu82') + ' ' + q.menu82 + '</div>';
            //
            var qlang = langAry( q.lang );
            if( qlang != '' ) qlang = '<div class="req_main"><span class="req req_lang">'+ qlang +'</span></div>';
            quest_req = $('<div class="reqs"></div>')
                .append('<h6>'+ lang('menu107') +'</h6>')
                .append('<div class="req_main">'+ rev_lv + '</div>')
                .append( qneed )
                .append( qlang )
        }
        //
        var awards = '';
        var awards_item = '';
        if( typeof q.award.exp      !== 'undefined' ) awards += '<span class="award"><span class="type '+ q.class +'"></span>'+ lang('menu112') +'<span class="exp">'+ q.award.exp +'</span></span>';
        if( typeof q.award.prestige !== 'undefined' ) awards += '<span class="award"><span class="type '+ q.class +'"></span>'+ lang('menu113') +'<span class="prestige">'+ q.award.prestige +'</span></span>';
        if( typeof q.award.gold     !== 'undefined' ) awards += '<span class="award"><span class="type gold"></span><span class="gold">'+ q.award.gold +'</span></span>';
        if( typeof q.award.item     !== 'undefined' ) {
            if( type == 'big' ) awards_item = $('<div class="awards_item"></div>').append( '<h6>獎勵物品</h6>' );
            $.each( q.award.item, function( item_id, item_num ){
                awards += '<span class="award"><img class="item" src="/img/item/uwo_'+ item_id +'.png"><span class="item">'+ lang( item_id ) + ( item_num > 1 ? '('+item_num+')' : '' ) +'</span></span>';
                if( type == 'big' ) awards_item.append( item_box( item_id, item_num ) );
            })
        }
        var quest_award = $('<div class="awards"></div>')
            .append('<h6>'+ lang('menu109') +' <em>'+ lang('menu120') +'</em></h6>')
            .append('<div class="award_main">'+ awards +'</div>')
            .append( awards_item );
        //
        var disid = q.award.disid;
        var quest_steps = $('<div class="steps"></div>').append('<h6>'+ lang('menu108') +'</h6>');
            $.each( q.s, function(i,v){
                var qi = i*1+1;
                var step = '';
                if( typeof v.go !== 'undefined' ) {
                    step = lang('queststep0','translate') +' <img class="citygo" src="/img/common/citygo.png" />'+ lang( v.go.cityid ) +' '+ lang( v.go.build );
                    quest_steps.append( $('<div class="step">'+qi+'. '+step+'</div>').click(function(){ city_go( v.go.cityid ) }) );
                }else if( typeof v.dhl !== 'undefined' ) {
                    step = lang('menu114')+': <img class="citygo" src="/img/common/citygo.png" />'+ lang( v.dhl.cityid ) +' '+ lang( v.dhl.build );
                    quest_steps.append( $('<div class="step">'+qi+'. '+step+'</div>').click(function(){ city_go( v.dhl.cityid ) }) );
                }else if( typeof v.search !== 'undefined' ) {
                    quest_steps.append( '<div class="step">'+qi+'. '+ lang('menu97') +': '+ lang(v.search.find) +'</div>' );
                    if( typeof discovery[v.search.find] !== '' ) disid = v.search.find;
                }else if( typeof v.fish !== 'undefined' ) {
                    var fish_times = v.fish > 0 ? ' ('+ v.fish +')' : '';
                    quest_steps.append( '<div class="step">'+qi+'. '+ lang('menu69') + fish_times + '</div>' );
                }else if( typeof v.step !== 'undefined' ) {
                    quest_steps.append( '<div class="step">'+qi+'. '+ lang(v.step,'translate') + (v.q > 0 ? ' ('+v.q+')' : '') +'</div>' );
                }else if( typeof v.trade !== 'undefined' ) {
                    quest_steps.append( $('<div class="step">'+qi+'. '+ lang('menu144') + '</div>' ).append( qstep_trade_more(v.trade.id, v.trade.q, type ) ) );
                }else if( typeof v.buy !== 'undefined' ) {
                    quest_steps.append( $('<div class="step">'+qi+'. '+ lang('menu145') + '</div>' ).append( qstep_trade_more(v.buy.id, v.buy.q, type ) ) );
                }else if( typeof v.get !== 'undefined' ) {
                    quest_steps.append( $('<div class="step">'+qi+'. '+ lang('menu115') + '</div>' ).append( qstep_trade_more(v.get.id, v.get.q, type ) ) );
                }else if( typeof v.gett !== 'undefined' ) {
                    quest_steps.append( $('<div class="step">'+qi+'. '+ lang('menu115') + '</div>' ).append( qstep_trade_more(v.gett.id, v.gett.q, type ) ) );
                    var gett_citys = $('<div class="citys"></div>');
                    $.each( trades[v.gett.id]['c'], function(i,cityid){ gett_citys.append( $( '<span class="ccity"><img class="citygo" src="/img/common/citygo.png" />'+lang(cityid)+'</span>' ).click(function(){ city_go(cityid) }) ) });
                    quest_steps.append( gett_citys );
                }else{
                    quest_steps.append( '<div class="step">'+qi+'. '+ step +'</div>' );
                }
            })
        //  disid
        var quest_discov = '';
        if( typeof disid !== 'undefined' ) {
            quest_discov = $('<div class="qdiscov"></div>')
                .append('<h6>'+ lang('menu96') +'</h6>')
                .append( dis_box( disid ) )
        }
        //
        var quest_city = $('<div class="citys"></div>').append('<h6>'+ lang('menu110') +'</h6>');
            $.each( q.city, function(i,cityid){ quest_city.append( $( '<span class="ccity"><img class="citygo" src="/img/common/citygo.png" />'+lang(cityid)+'</span>' ).click(function(){ city_go(cityid) }) ) });

        //
        var qname = lang( qid, 'qname translate titop' );
        if( q.type == 'deliver' ) qname = langN('menu128') + langN(q.did);
        var quest_name = $('<div class="name '+qid+'"><span class="type '+ q.class +'"></span><em class="have '+have( qid )+'"></em>'+ qname +'</div>');
        if( q.type == 'bar' || q.type == 'union' ) quest_name.click( function() { $('.'+qid+' .have').toggleClass('gou', ( have( qid, true )=='gou' ) ) })
        //
        var light_main_data = $('<div class="quest_data box_quest"/>')
            .append( quest_name )
            .append( quest_req )
            .append( quest_steps )
            .append( quest_award )
            .append( quest_discov )
            .append( quest_city )
        //
        light_main.append( light_main_data );
    return light_main;
}
//
function pop_timer() {
    $('#city .reciprocal em').each( function(){
        var zoneid = $(this).data('zoneid');
        if( typeof zoneid === 'undefined' ) return;
        var pop = pop_zone[zoneid];
        var iHour = $(this).data('ihour')*1;// 當前顯示小時
        var oSec = nMin*60 + nSec;          // 本小時已過秒數
        var rSec = ( 3600 - oSec )+pop.d*1; //  剩餘秒數 (加上delay秒數)
        if( nHour > iHour ) {               //  下一個小時了 秒數超過 pop.d 時間則更新
            if( oSec > pop.d ) {
                if( Gtmp['box_left'] == 'pop' ) box_left_pop('pop'); 
                pop_box( zoneid );
                return;
            }
            rSec = pop.d - oSec;
        }
        //
        var nM = Math.floor( rSec / 60 );
        var sM = add_zero( nM % 60 );
        var sS = add_zero( Math.floor( rSec % 60 ) );
        $(this).html( '<b class="'+( nM <= 10 ? 'm10' : '' )+'">⌛'+sM+':'+sS+'<b>');
    } )
}

//  
function pop_set() {
    if( typeof Gtmp['pop_timer'] === 'undefined' ) Gtmp['pop_timer'] = true;
    if( typeof Gtmp['pzone2id'] === 'undefined' ) Gtmp['pzone2id'] = {};
    if( typeof Gtmp['pop2id'] === 'undefined' ) Gtmp['pop2id'] = {};
    //
    var show_pop_box = cache( 'show_pop_box', null, {'def':'1'} );
    if( show_pop_box == '1' ) {
        Gtmp['pop_timer'] = true;
    }else{
        Gtmp['pop_timer'] = false;
        $('#city .pop_box ').hide();
    }
    //
    $.each( pop_zone, function( zoneid, pop ) {
        Gtmp['pzone2id'][lang( zoneid, '' ,'1' )] = zoneid;
        if( show_pop_box == '1' ) pop_box( zoneid, pop );
    })
    $.each( popular_trade, function( popid, pt ) {
         Gtmp['pop2id'][lang( popid, '' ,'1' )] = popid;
    })
    return true;
}
//  
function pop_dark( pid, pddpt ) {
    var dark = cache( 'pop_hide_'+pid );
    res = cache( 'pop_hide_'+pid , ( dark == '0' ? '1' : '0' ) );
    if( res == '1' ) {
        $('.'+pddpt+'.'+pid).addClass('dark');
        if( pddpt == 'pdd' ) $('#zones_'+pid).slideUp();
    }
    if( res == '0' ) {
        $('.'+pddpt+'.'+pid).removeClass('dark');
        if( pddpt == 'pdd' ) $('#zones_'+pid).slideDown();
    }
}

//  pop_box( zoneid, pop_timezone )
Gtmp['pops'] = {};
function pop_box( zoneid, pop ) {
    //
    if( typeof zoneid === '' ) return false;
    if( typeof pop !== 'object' ) pop = pop_zone[zoneid];
    if( typeof pop.z === 'undefined' ) return false;
    //
    var Box_pop = $('#pop_'+zoneid);
    if( Box_pop.length == 0 ) {
        Box_pop = $('<div id="pop_'+zoneid+'" class="box_body pop_box fly_box nowheel noselect"></div>');
        $('#city').append( Box_pop );
    }
    //
    var iStart = -2;
    var iEnd = iStart + 24; 
    //  更新 Gtmp
    Gtmp['pops'][pop.z] = [];
    for( i=iStart; i<iEnd; i++ ) {
        Gtmp['pops'][pop.z].push([ nHour+i, popular( pop.z, i ) ]);
    }
    //
    var sHour = nHour - 1;
    var cHour = nHour;
    var li_min = Math.round( pop.d/60 );
    // 如果delay時間還沒到調整位置
    if( ( ( nMin*60 + nSec ) - pop.d ) < 0 ) {
        sHour += -1;
        cHour += -1;
    }
    //
    var cday = 0;
    var hide_pi = 2;
    var pop_count = 0;
    var pop_ul = $('<ul class="pop_ul main_scroll"></ul>');
    $.each( Gtmp['pops'][pop.z], function( pi, pop_arr ) {
        var pH = pop_arr[0]*1;
        if( pH < sHour ) return;
        var pops = pop_arr[1];
        var li_class = pH == cHour ? 'nowHour' : '';
        pH = ( pH + 24 ) % 24;
        if( pH == 0 ) cday = 1;
        var pop_li = $('<li class="'+ li_class +'"><div class="pop_time"><em>'+ add_zero( pH ) +':'+ add_zero( li_min ) +'</em></div></li>');
        if( li_class == 'nowHour' ) {
            hide_pi = pi;
            pop_li.append('<div class="pop_time reciprocal"><em class="" data-zoneid="'+zoneid+'" data-ihour="'+pH+'"></em></div>');
        }
        //  popular_trade[popid].
        if( pops.length > 0 ) {
            pop_count++;
            $.each( pops, function( i, popid ) {
                var pop_trade = $('<div class="pop_trade"></div>');
                var res_dark = cache( 'pop_hide_'+popid );
                var pdd = $( lang( popid, ( res_dark == '1' ? popid + ' pdd dark' : popid + ' pdd' ) ) ).click(function(){ pop_dark( popid, 'pdd' ) });
                var tread_list = $('<span class="trades '+ popid +'_pts"></span>');
                $.each( popular_trade[popid], function( ptid, pt ) {
                    var res_dark = cache( 'pop_hide_'+ptid );
                    tread_list.append( $( lang( ptid, ( res_dark == '1' ? ptid + ' pt dark' : ptid + ' pt' ) ) ).click(function(){ pop_dark( ptid, 'pt' ) } ) );
                })
                //
                var pdd_hm = add_zero( pH ) +':'+ add_zero( li_min );
                pop_trade
                    .append( pdd )
                    .append( tread_list )
                    .on('contextmenu', function(e) { context_menu( e, {'type':'pop', 'zoneid':zoneid, 'popid':popid, 'hm':pdd_hm } ); return false; })
                    
                //
                pop_li.append( pop_trade )
            });
            //
            pop_li.append( '<div style="clear: both;"></div>' );
            //  如果换日後還有大流行 則加一行提示
            if( cday ) {
                pop_ul.append('<li class="changeday">'+ lang('menu239', 'translate') +'</li>');
                cday = 0;
            }
        }else{
            //  沒大流行
            // var pdd_hm = add_zero( pH ) +':'+ add_zero( li_min );
            // pop_li.on('contextmenu', function(e) { context_menu( e, {'type':'pop', 'zoneid':zoneid, 'popid':'no', 'hm':pdd_hm } ); return false; })
            if( pi > hide_pi ) pop_li.hide();
        }
        //
        pop_ul.append( pop_li );
    })
    //  pop_count
    var pop_more = $('<li class="nomore"></li>')
        .append( lang('menu240', 'translate emoji') )
        .on( 'click', function(){ $('#lt_menu .btn3').click(); } )
    pop_ul.append( pop_more )
    //
    var pop_h6 = $('<h6><img class="pop" src="/img/common/pop.png?v=1">'+ lang( zoneid ) +'<img class="town" src="img/town3.png"></h6>').click(function(){ popular_svg( zoneid ) });
    //
    Box_pop
        .html('')
        .append( pop_h6 )
        .append( pop_ul )
        .css({'left':pop['x']+'px','top':pop['y']+'px'})
        .show()
    pop_ul.scrollbar();

    return true;
}
//       popular( 地區時區, 幾小時後 )
function popular( zoneHour, iHour=0 ) {
    var pHour = Math.floor( ( now - 1670889600 ) / 3600 );
    var Si = pHour + zoneHour*1 + ( zoneHour*400 ) + iHour;
    var res = [];
    if (Si % 379 == 0) { res.push('pop1')}; // 奢侈  
    if (Si % 337 == 0) { res.push('pop2')}; // 繁榮  
    if (Si % 311 == 0) { res.push('pop3')}; // 開發  
    if (Si % 269 == 0) { res.push('pop4')}; // 贊助  
    if (Si % 241 == 0) { res.push('pop5')}; // 戰爭  
    if (Si % 223 == 0) { res.push('pop6')}; // 洪水  
    if (Si % 199 == 0) { res.push('pop7')}; // 傳染病
    if (Si % 179 == 0) { res.push('pop8')}; // 節慶  
    return res.slice(0,2);
}
//       popular( 地區時區, 幾小時後 )
function popular_old( zoneHour, iHour=0 ) {
    pHour = Math.floor( ( now - 1674489600 ) / 60 / 60 ) + 1;// +1 = GTM+9 改 +8
    var Si = pHour + zoneHour + iHour;
    var res = [];
    if (Si % 19 == 8) { res.push('pop1')};
    if (Si % 17 == 4) { res.push('pop2')};
    if (Si % 13 == 2) { res.push('pop3')}; 
    if (Si % 11 == 2) { res.push('pop4')};     
    if (Si %  7 == 2) { res.push('pop5')};
    if (Si %  5 == 1) { res.push('pop6')};
    if (Si %  3 == 0) { res.push('pop7')};
    if (Si %  2 != 0) { res.push('pop8')};
    return res.slice(0,2);
}

//  popular_svg( 'zone_37' )
function popular_svg( popular_zone ) {
    if( $('#layer_'+popular_zone).length > 0 ) {
        $('#layer_'+popular_zone).toggle();
        return false;
    }
    return citys2svg( popular_citys[popular_zone], popular_zone );
}
//  
function tzone_set() {
    if( cache( 'show_tzone_box', null, {'def':'1'} ) != '1' ) {
        $('#city .tzone_box ').hide();
        return false;
    }
    //
    Gtmp['pop_timer'] = true;
    $.each( trade_zone_citys, function( zoneid, citys ) {
        tzone_box( zoneid, citys );
    });
    return true;
}   
//  tzone_box( zoneid, citys ) 
function tzone_box( zoneid, citys, clone=0 ) {
    if( typeof zoneid === '' ) return false;
    //
    var Box_id = 't'+zoneid;
    if( clone != 0 ) Box_id += '_' + clone;
    var Box_tzone = $('#'+Box_id);
    if( Box_tzone.length == 0 ) {
        Box_tzone = $('<div id="'+Box_id+'" class="box_body tzone_box nowheel noselect"></div>');
        $('#city').append( Box_tzone );
    }
    //
    var tzone_main = $('<div class="tzone_main trade_buff"></div>')
        //.append( '<h6>'+ lang('menu134') +'</h6>' )
    $.each( tzone_buff[zoneid], function( tt_id, buff ){ 
        var zbuff = 
            $('<div class="zbuff '+ (buff>0?'p':'m') +'" data-tid="'+ tt_id +'"></div>')
            .append( '<span class="buff">'+ (buff>0?'+':'') + buff +'%</span>' )
            .append( lang( tt_id, 'tt' ) )
            .click( function(){ tt_id.indexOf('type') === -1 ? light_box_show( $(this), '', trade_info( tt_id, 'small' ) ) : box_left_trade( tt_id ) ; })
        tzone_main.append( zbuff );
    } )
    //
    var tzone_h6 = $('<h6>'+ lang( zoneid ) +' '+ lang('menu134') +'<img class="town" src="img/town3.png"></h6>').click(function(){ tzone_svg( zoneid ) });
    //  zone xy
    var zxy = zone_xy[zoneid]['xy'+(clone==0?'':clone)];
    if( clone === 0 && typeof zone_xy[zoneid]['xy2'] !== 'undefined' ) tzone_box( zoneid, citys, 2 );
    if( clone === 0 && typeof zone_xy[zoneid]['xy3'] !== 'undefined' ) tzone_box( zoneid, citys, 3 );
    //
    Box_tzone
        .html('')
        .append( tzone_h6 )
        .append( tzone_main )
        .css({'left':zxy['x']+'px','top':zxy['y']+'px'})
        .show()
    return true;
}
//  tzone_svg( 'zone_37' )
function tzone_svg( tzone ) {
    //
    if( tzone == 'zone_62' ) {
        trade_zone_citys['zone_62_2'] = ['town20104'];
        tzone_svg('zone_62_2');
    }
    if( $('#layer_t'+tzone).length > 0 ) {
        $('#layer_t'+tzone).toggle();
        return false;
    }
    return citys2svg( trade_zone_citys[tzone], 't'+tzone, '#a3d1b880' );
}
//  
function citys2svg( citys, layer='', bg='#a39b8c80' ) {
    //
    if( layer == '' ) layer = 'layer';
    //
    const points = [];
    $.each( citys, function( i, cid ){
        const cx = json_city[cid].x*1;
        const cy = json_city[cid].y*1;
        points.push( { 'x': cx-0, 'y': cy-0 } );
        points.push( { 'x': cx+70, 'y': cy-0 } );
        points.push( { 'x': cx+70, 'y': cy+50 } );
        points.push( { 'x': cx-0, 'y': cy+50 } );
    } )
    //
    var polygon = layer_svg( points, layer );
    //  
    polygon.fill( bg );
    return polygon;
}
// 
function layer_svg( points, layer ) {
    var svg = SVG().addTo('#layers').size(9972, 5886).attr('id','layer_'+layer);
    //
    var pp = points2polygon( points );
    // 圖形修正
    if( layer == 'zone_20'   ) pp = pp.replace("1324,1402", "1324,1402 2000,2462");
    if( layer == 'zone_34'   ) pp = pp.replace("8291,507 8291,507 104", "8291,507 5786,617 5114,423 4074,637 2072,771 104");
    if( layer == 'zone_50'   ) pp = pp.replace("7307,2779 8008", "7307,2779 7430,2779 7530,2960 8008");
    if( layer == 'zone_59'   ) pp = pp.replace("6887,2793", "7450,2750 6887,2793");
    if( layer == 'zone_60'   ) pp = pp.replace("3454,3642", "3454,3642 2506,2703 2420,2720 2200,2500");
    if( layer == 'tzone_17'  ) pp = pp.replace("3020,1022 2515", "3020,1022 2777,1715 2215,2210 2515");
    if( layer == 'tzone_17'  ) pp = pp.replace("2445,2710 2009", "2445,2710 2228,2535 2009");
    if( layer == 'tzone_21'  ) pp = pp.replace("4272,2131 4652", "4272,2131 4185,2420 4652");
    if( layer == 'tzone_28'  ) pp = pp.replace("7307,2779 8008", "7307,2779 7430,2779 7530,2960 8008");
    if( layer == 'tzone_34'  ) pp = pp.replace("5595,434 5595,434", "5595,434 5595,434 5113,427");
    if( layer == 'tzone_62'  ) pp = pp.replace("9680,3450 9680,3500 9680,3500", "831,3185 832,3250");
    if( layer == 'tzone_31'  ) pp = pp.replace("1753 9005", "1753 8326,1883 8235,2007 9005");
    if( layer == 'tzone_62'  ) pp = pp.replace("222,2374", "0,3500 0,2800");
    if( layer == 'tzone_62_2') pp = pp.replace("9680,3450 9680,3500", "9972,2800 9972,3500");
    if( layer == 'tzone_13'  ) pp = pp.replace("5328,1836", "5306,1943");
    if( layer == 'tzone_13'  ) pp = pp.replace("1719 5529,2072 5459,2072", "1719 5343,1880 5343,1935 5515,2028 5515,2062 5459,2062");
    if( layer == 'tzone_14'  ) pp = pp.replace("5278,1992 5635,2026 5635,2076 5635,2076 5582,2108",
                                               "5278,1992 5458,2066 5520,2066 5574,2034 5611,2034 5612,2065 5555,2096");
    if( layer == 'tzone_21'  ) pp = pp.replace("3931,2532 4582,2498", "3931,2532 3981,2532 4284,2763 4359,2763 4582,2498");
    if( layer == 'tzone_66'  ) pp = pp.replace("5105,2016 4356,2759", "5105,2016 4587,2483 4356,2759");
    if( layer == 'tzone_20'  ) pp = pp.replace("405,350 2527,2713", "405,350 2007,2450 2227,2540 2440,2713 2527,2713");
    if( layer == 'tzone_5'   ) pp = pp.replace("5595,434 5419,1040", "5595,434 5440,840 5419,1040");
    //  4373 2754
    //   -13  +11
    //  4360,2765
    //
    var polygon = svg.polygon( pp );
    return polygon;
}
//
function points2polygon( points ) {
    // 按照 x 座標排序
    points.sort((a, b) => a.x - b.x);

    // 找到下半部份的點
    const lower = [];
    for (let i = 0; i < points.length; i++) {
      while (lower.length >= 2 && 
        (lower[lower.length - 2].x - lower[lower.length - 1].x) * (points[i].y - lower[lower.length - 1].y) 
        >= (lower[lower.length - 2].y - lower[lower.length - 1].y) * (points[i].x - lower[lower.length - 1].x)) {
        lower.pop();
      }
      lower.push(points[i]);
    }

    // 找到上半部份的點
    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && 
        (upper[upper.length - 2].x - upper[upper.length - 1].x) * (points[i].y - upper[upper.length - 1].y) 
        >= (upper[upper.length - 2].y - upper[upper.length - 1].y) * (points[i].x - upper[upper.length - 1].x)) {
        upper.pop();
      }
      upper.push(points[i]);
    }

    // 合併上半部份和下半部份的點
    const hull = lower.concat(upper);

    // 生成多邊形的點字串
    const polygonPoints = hull.map((point) => `${point.x},${point.y}`).join(" ");
    return polygonPoints;
}
//
//  layer_zone( points )
function layer_zone( points ) {
    // 按照 x 座標排序
    points.sort((a, b) => a.x - b.x);

    // 找到下半部份的點
    const lower = [];
    for (let i = 0; i < points.length; i++) {
      while (lower.length >= 2 && 
        (lower[lower.length - 2].x - lower[lower.length - 1].x) * (points[i].y - lower[lower.length - 1].y) 
        >= (lower[lower.length - 2].y - lower[lower.length - 1].y) * (points[i].x - lower[lower.length - 1].x)) {
        lower.pop();
      }
      lower.push(points[i]);
    }

    // 找到上半部份的點
    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && 
        (upper[upper.length - 2].x - upper[upper.length - 1].x) * (points[i].y - upper[upper.length - 1].y) 
        >= (upper[upper.length - 2].y - upper[upper.length - 1].y) * (points[i].x - upper[upper.length - 1].x)) {
        upper.pop();
      }
      upper.push(points[i]);
    }

    // 合併上半部份和下半部份的點
    const hull = lower.concat(upper);

    // 生成多邊形的點字串
    const polygonPoints = hull.map((point) => `${point.x}px ${point.y}px`).join(", ");

    // 將多邊形點字串套用到 clip-path 上
    $('#layers .layer1').css({'clip-path':`polygon(${polygonPoints})`});
}

var discov_arr = {};
function discov_set() {
    discov_arr = {};
    $.each( discovery, function( disid, d ) {
        //  同樣 xy 定位用
        if( typeof d.x == 'undefined' ) d.x = 0;
        if( typeof d.y == 'undefined' ) d.y = 0;
        var dxy = d.x + '_' + d.y;
        if( typeof discov_arr[dxy] === 'undefined' ) discov_arr[dxy] = [];
        //  xy2
        if( typeof d.xy2 !== 'undefined' ) {
            $.each( d.xy2, function( k,xy ) {
                if( typeof discov_arr[xy] === 'undefined' ) discov_arr[xy] = [];
                discov_arr[xy].push( disid );
            });
        }
        if( typeof d.m === 'undefined' ) d.m = 'search_sea';
        if( d.m == 'village' ) {
            if( typeof d.b !== 'undefined' ) barter_set( disid, d );   //  有換物
            discov_arr[dxy].unshift( disid );
        }else{
            discov_arr[dxy].push( disid );
        }
    })
    $.each( discov_arr, function(dxy,dd){
        if( dxy == '0_0' || dxy == '_' ) return;
        var dxys = dxy.split('_');
        var disid = dd[0];
        var d = discovery[disid];
        var dm = d.m;
        var img = '<img class="dimg" src="/img/'+d.m+'.png" />';
        if( d.t2 == 'disfav17' ) img = '<em class="emoji">🌟</em>';
        if( d.m == 'clues' ) img = '<em class="emoji">📜 </em>';
        if( d.m == 'chronicle' || d.m == 'clues' ) dm += ' search_sea';
        var display = cache( 'show_'+d.m, null, {'def':'1'} ) == '1' ? '' : 'display:none;';
        var discov = $('<div id="dxy_'+ dxy +'" class="discov '+disid+' '+have( dxy )+' dxy_'+ dxy +' '+dm+' noselect" style="left:'+dxys[0]+'px;top:'+dxys[1]+'px;'+display+'"></div>')
            .append( img )
            //.on( 'mouseover', function(){ clearTimeout( TO_light ); if( have( dxy ) == '' ) { discov_light( this, dxy ) } })
            .on( 'mouseover', function(){ clearTimeout( TO_light );  })
            .on( 'mouseout' , function(){ clearTimeout( TO_light ); TO_light = setTimeout(function(){ $('#light_box').fadeOut(200) }, 500); })
            .on( 'click'    , function(){ discov_light( this, dxy, d.m ); })
        $('#city').append( discov );
    })
    for( i=1 ; i<=8 ; i++ ){
        $('.discov08sT00'+i+' .dimg').addClass('sfish');
    }
    //  check discov ver 
    if( cache( 'ver.discov' ) != parseInt( ver ) ) {
        // reset discov have
        $.each( localStorage, function(k,w){
            if( k.indexOf('have.') == 0 ) {
                if( k.indexOf('_') !== -1 && typeof discov_arr[k.replace('have.','')] == 'undefined' ) $.removeLocalStorage( k );
                if( w == '' ) $.removeLocalStorage( k );
            }
        })
        $.each( discov_arr, function(dxy,dd){
            if( have(dxy) == 'gou' ) return;
            var dxy_gou = 1;
            $.each( dd, function(k,v){
                if( have(v) != 'gou' ) dxy_gou = 0;
            })
            if( dxy_gou == 1 ) have(dxy,'gou');
        })
        // updata
        cache( 'ver.discov', parseInt( ver ) );
    }
}
//
function check_discov_gou( dxy ) {
    if( discov_arr[dxy].length == 0 ) return false;
    var all_gou = true;
    $.each( discov_arr[dxy], function( i, disid ){
        if( have( disid ) == '' ) all_gou = false;
    })
    //
    have( dxy, ( all_gou ? 'gou' : 'nogou' ) );
    $('.dxy_'+ dxy).toggleClass( 'gou', all_gou );
}
function dis_box( disid, dxy='' ) {
    if( typeof discovery[disid] === 'undefined' ) return '';
    var d = discovery[disid];
    var dis_box = $('<div class="dis_box '+ disid +'"></div>');
    var dis_img = $('<div class="thumb grade_'+ d.r +'"><img src="'+ img_src( 'discov', disid ) +'" /></div>')
        .click( function() { 
            $('.'+disid+' .have').toggleClass( 'gou', (have( disid, true ) == 'gou') );
            if( dxy !== '' ) check_discov_gou( dxy );
        })
    var discov_q = '';
    if( d.g == 'menu72' ) discov_q += '【'+langN('menu72')+'】' + lang( d.q );
    if( d.g == 'menu73' ) discov_q += '【'+langN(d.char)+ langN('menu73') +'】';
    if( typeof d.v !== 'undefined' ) discov_q += list2lang( d.v );
    if( typeof d.nt !== 'undefined' ) discov_q += list2lang( d.nt, 'dnote translate' );
    if( typeof d.c !== 'undefined' ) {
        var dc = discov_clues[d.c];
        if( dc.x !== '' ) discov_q += '<span class="cl_go emoji" onclick="discov_go( \''+dc.x+'_'+dc.y+'\' );event.stopPropagation()">📜 '+ langN( dc.l == 1 ? 'menu199' : 'menu200' ) +' ( '+ dc.n +', '+ dc.e +' )</span>';
    }
    if( typeof d.d !== 'undefined' ) {
        var dd = discovery[d.d];
        var dc = discov_clues[dd.c];
        if( dc.x !== '' ) discov_q += '【'+ lang( ( dc.l == 1 ? 'menu199' : 'menu200' ) ) +'】 ( '+ dc.n +', '+ dc.e +' )<br />';
        if( typeof dd.x !== 'undefined' ) discov_q += '<span class="cl_go emoji" onclick="discov_go( \''+dd.x+'_'+dd.y+'\' );event.stopPropagation()">🌟'+ langN( d.d ) +'</span>';
    }
    //
    var dname = lang( disid, 'dname translate' );
    if( d.m == 'clues' ) dname = '<span class="dname">' + lang( d.d ) + ' ' + lang( 'menu201' ) + '</span>';
    //
    var dis_data = '<div class="list_data">'
            + dname
            + discov_q
            + lang( disid+'_req', 'dreq', '', '' )
            +'</div>';

    dis_box
        .append( dis_img )
        .append( '<em class="have '+have( disid )+'"></em>' )
        .append( dis_data )
    return dis_box;
}
//
function discov_light( dthis, dxy, dtype='' ) {
    if( discov_arr[dxy].length == 0 ) return false;
    var light_box = $('#light_box').html('').attr('class','light_discov');
    //
    var dz = discov_zone[dxy];
    //
    var h6 = $('<h6></h6>');
    if( dtype !== '' ) h6.append( lang( dtypeL[dtype], 'translate' ) );
    if( typeof dz != 'undefined' ) h6.append( lang( dz.id, 'dz translate' ) );
    light_box.append( h6 );
    //
    if( typeof dz != 'undefined' ) {
        var dis_zone = $('<div class="dis_zone"></div>');
            if( typeof dz.s != 'undefined' ) dis_zone.append( '<span class="sleep">'+lang('menu226', 'translate')+' <b>'+dz.s+'</b></span>' );
            if( typeof dz.f != 'undefined' ) dis_zone.append( '<span class="fight">'
                                                                +'<b data-tooltip="'+langN('menu227')+'">'+dz.f[0]+'</b> / '
                                                                +'<b data-tooltip="'+langN('menu228')+'">'+dz.f[1]+'</b> / '
                                                                +'<b data-tooltip="'+langN('menu229')+'">'+dz.f[2]+'</b>'
                                                              +'</span>' );
            if( typeof dz.r != 'undefined' ) dis_zone.append( '<div class="res">'+langAry(dz.r, 'item translate')+'</div>' );
            //
            if( dis_zone.html() != '' ) light_box.append( dis_zone );
    }
    //
    $.each( discov_arr[dxy], function( i, disid ){
        light_box.append( dis_box( disid, dxy ) );
    })
    //
    var dL = parseInt( $(dthis).css('left') );
    var dT = parseInt( $(dthis).css('top') );
    if( TestMode ) {
        var txt_title = ( typeof dz != 'undefined' ) ? langN( dz.id ) : '' ;
        var txt = '' + dL + '"; // ' + dT + "\n" +
                  '$dis_xy["'+dxy+'"]["x"] = "' + dL + '"; // ' + txt_title + "\n" +
                  '$dis_xy["'+dxy+'"]["y"] = "' + dT + '";' + "\n" ;
        light_box.append('<div><textarea style="width:245px;height:30px;">'+txt+'</textarea></div>');
    }
    //
    check_discov_gou( dxy );
    //
    var cH = light_box.height();
    var cT = $(dthis).offset().top;
    if( ( cT + cH ) > $(window).height() ) cT = $(window).height() - cH - 20;
    var cL = $(dthis).offset().left + ( 20*transform.scale );
    light_box
        .css({top: cT, left: cL})
        .show()
    arrow_there( dL-24, dT-20, 12 );
}

//  d = discovery[disid]
function barter_set( disid, d ) {
    //    /img/skill/uwo_skill202164.png
    var display = cache( 'show_barter', null, {'def':'1'} ) == '1' ? '' : 'display:none;';
    var barter = $('<div id="'+disid+'_barter" class="discov barter noselect" style="left:'+d.x+'px;top:'+(d.y-20)+'px;'+display+'"></div>')
        .append('<img class="dimg" src="/img/skill/uwo_skill202164.png" />')
        .on( 'mouseover', function(){ clearTimeout( TO_light );  })
        .on( 'mouseout' , function(){ clearTimeout( TO_light ); TO_light = setTimeout(function(){ $('#light_box').fadeOut(200) }, 500); })
        .on( 'click'    , function(){ barter_light( this, disid, d ); })
    $('#city').append( barter );
}
//  d = discovery[disid]
function barter_light( dthis, disid, d ) {
    //
    var light_box = $('#light_box').html('').attr('class','light_barter')
                    .append( '<h6>'+ lang(disid, 'translate') +': '+ lang('menu168', 'translate') +'</h6>' );
    //  
    $.each( d.b, function( bid, vid ){
        light_box.append( barter_db( bid, 'light' ) );
    })
    var dL = parseInt( $(dthis).css('left') );
    var dT = parseInt( $(dthis).css('top') );
    //
    var cH = light_box.height();
    var cT = $(dthis).offset().top;
    if( ( cT + cH ) > $(window).height() ) cT = $(window).height() - cH - 20;
    var cL = $(dthis).offset().left + ( 20*transform.scale );
    light_box
        .css({top: cT, left: cL})
        .show()
    arrow_there( dL-24, dT-20, 12 );
}
function barter_db( bid, boxin ) {
    var b = barter_arr[bid];
    var t = trades[b.t];
    //
    var vneeds = $('<div class="vneeds"></div>');
    $.each( b.c, function( ctid, tnum ){
        var bc_box = $('<span class="need '+ ctid +' in_left_box""></span>')
                .append( '<span class="thumb grade_'+ ( t.r == 5 ? 5 : 4 ) +' show_light_box light_trade" data-tid="'+ ctid +'"><img src="'+ img_src( 'trade', ctid ) +'" /></span>' )
                .append( $( lang( ctid, 'show_light_box light_trade' ) ).data('tid',ctid).click( function(){ trade_info_show( ctid ) } ) )
                .append( '<em>'+ tnum +'</em>' )
        if( boxin == 'trade_info' ) bc_box.append( '<img class="inv" src="/img/inv_undefined.png">' );
        vneeds.append( bc_box );
    });
    var bf = b.f !== null ? '<b class="bf" lang="'+ b.f +'">'+ langN( b.f ) +'</b>' : '';
        if( typeof b.menu235 != 'undefined' ) bf += '<b class="bf">'+ lang('menu235') +' '+ b.menu235 +'</b>';
        if( typeof b.menu236 != 'undefined' ) bf += '<b class="bf">'+ lang('menu236') +' '+ b.menu236 +'</b>';
        if( typeof b.menu237 != 'undefined' ) bf += '<b class="bf">'+ lang('menu237') +' '+ b.menu237 +'</b>';
        if( typeof b.menu238 != 'undefined' ) bf += '<b class="bf">'+ lang('menu238') +' '+ b.menu238 +'</b>';
    var bs = b.s !== null ? '<b class="bs" lang="'+ b.s +'">'+ langN( b.s ) +'</b>' : '';
    var vthumb = $('<span class="thumb '+ b.t +' grade_'+ ( t.r == 5 ? 5 : 4 ) +'"></span>')
            .append( '<em>'+ Math.floor( b.n * b.nb ) +'</em>' )
            .append( '<img src="'+ img_src( 'trade', b.t ) +'" />' )
            if( boxin == 'trade_info' ) vthumb.append( '<img class="inv" src="/img/inv_undefined.png">' );
    var vtrade = $('<div class="vtrade"></div>')
            .append( vthumb )
            .append( $('<span class="tname">'+ bf + bs + lang( b.t ) +'</span>').click( function(){ trade_info_show( b.t ) } ) )
            .append( $('<span class="ttodo">📝</span>').click( function(){ show_todo_list( '', '['+langN( b.t )+']' ); return false; }))

    //
    var box = $('<div class="vtrade_box '+bid+'"></div>')
        .append( vtrade )
        .append( vneeds )
    return box;
}
function barter_db_cal( bid ) {
    $('#'+bid+'_calc .cal_res').html('※ '+ lang('menu187', 'translate'));
    var b = barter_arr[bid];
    var barter_fri = cache( 'barter_fri', null, {'def':'0.2'} )*1;
    var barter_inv = cache_kv( bid+'_inv' );
    var barter_clv = cache( 'barter_clv', null, {'def':'13'} )*1;
    var barter_sts = cache( 'barter_sts', null, {'def':'menu192'} );
    var barter_dis = cache( 'barter_dis', null, {'def':'0'} )*1;
    var barter_bns = cache( 'barter_bns', null, {'def':'0'} )*1;

    //
    var barter_num_s = '#'+bid+'_calc .barter_num';
    var barter_num = $(barter_num_s).val()*1;
    var Nmax = b.m ? b.m : 100;
    if( barter_num > Nmax ) {
        var res = $('<div></div>')
            .append( '<span>※ ' + lang('menu195', 'translate') + ': </span>' )
            .append( $('<a href="javascript:void(0);">'+Nmax+'</a>').click( function(){ $(barter_num_s).val( Nmax ); barter_db_cal( bid ); } ) )
        $('#'+bid+'_calc .cal_res').html( res  );
    }
    if( barter_num < 1 ) {
        barter_num = 1;
        $(barter_num_s).val( barter_num );
        $('#'+bid+'_calc .cal_res').html('※ ' + lang('menu186') + ' 1 ~ ' + Nmax );
    }
    $.each( b.c, function( ctid, tnum ){
        var ctt = trades[ctid].t;
        if( typeof barter_inv[ctt] == 'undefined' ) barter_inv[ctt] = 0.2;
        var discount = barter_inv[ctt]*1 + (barter_clv*0.01) + (barter_dis*0.01);
        var cn = tnum * barter_num;
        cn -= Math.floor( cn * discount );
        $('.vtrade_box.'+bid+' .'+ctid+' em').html( cn );
        $('.vtrade_box.'+bid+' .'+ctid+' .inv')
            .attr( 'src', '/img/inv_'+ barter_inv[ctt] +'.png' )
            .click( function(){ fade_box_show( $(this), 'fade_box', inv_change_box( bid, ctt ) ) } )
    });
    // bs
    var tt = trades[barter_arr[bid].t].t;
    var bs0 = '';
    var bs = 1+barter_stss[barter_sts]*1;
        if( ( barter_sts == 'menu171' && ( tt == 11 || tt == 18 ) ) ||
            ( barter_sts == 'menu172' && ( tt == 5  || tt == 13 ) ) ||
            ( barter_sts == 'menu173' && ( tt == 3  || tt ==  8 ) ) ||
            ( barter_sts == 'menu196' && ( tt == 17 || tt ==  2 ) ) ||
            ( barter_sts == 'menu190' && ( tt == 19 || tt == 12 ) ) ||
            ( barter_sts == 'menu194' &&   tt == 4 )
            ) bs += 0.1;
        if( b.s !== null && b.s.indexOf('discov') === -1 && barter_sts != b.s ) bs0 = 'x';
    var tt_inv = barter_inv[tt];
        if( tt_inv == '-0.2' ) bs0 = 'x';
        $('.vtrade_box.'+bid+' .thumb .inv')
            .attr( 'src', '/img/inv_'+ tt_inv +'.png' )
            .click( function(){ fade_box_show( $(this), 'fade_box', inv_change_box( bid, tt ) ) } )
    var bf = 1;
        if( b.f !== null && b.f == 'menu170' && barter_fri < 0.15 ) bs0 = 'x';
        if( b.f !== null && b.f == 'menu175' && barter_fri < 0.2  ) bs0 = 'x';
        if( b.fb !== null ) barter_fri += b.fb;
        bf += barter_fri;
    if( typeof barter_inv[tt] == 'undefined' ) barter_inv[tt] = 0.2;
    var times = 1;
        times += barter_inv[tt]*1;
        times += barter_clv*0.01;
        times += barter_bns*0.01;
        times += 0.03;
        times = Math.round( times * 100 ) / 100;
        //console.log( times );
    var bnn = b.n * barter_num; // 6 * 100
    //var bm_inv = bnn * ( 1+barter_inv[tt]*1 ); // 600 * 1.2
    //var bm_fri = bm_inv * barter_fri * 1.03;
    //var bm_blv = bm_inv * (barter_clv*0.01) * 1.03;
    //var bm_bns = bm_inv * (barter_bns*0.01);
    //console.log( bnn, times, bf, bs, b.nb );
    var bm = Math.floor( ( bnn * times * bf * bs * b.nb ) + 0.001 );
    $('.vtrade_box.'+bid+' .'+b.t+' em').html( '<b class="'+bs0+'">'+bm+'</b>' );
    $('.vtrade_box.'+bid).addClass('caled');
}
function inv_change_box( bid, ttid ) {
    var barter_inv = cache_kv( bid+'_inv' );
    var box_html = $( '<div class="inv_change_box"></div>' );
        //.append( '<span>'+ lang( 'tradetype'+ttid ) +' '+ lang('menu184') +'：</span>' )
    $.each( barter_invs, function( lid, n ){
        var sttid = ttid;
        var span = $('<span class="span30 tt'+ttid+' '+lid+' '+( barter_inv[ttid] == n ? 'selected' : '' )+'" data-n="'+n+'" data-ttid="'+ttid+'"><img src="/img/inv_'+ n +'.png" /></span>')
            .click( function(){ barter_inv_change( bid, sttid, n, lid ); $('#light_box.fade_box').hide(); })
        box_html.append( span );
    });
    return box_html;
}
function barter_inv_change( bid, sttid, n, lid ) {
    cache_kv( bid+'_inv', sttid, n );
    $('.inv .tt'+sttid).removeClass('selected');
    $('.inv .tt'+sttid+'.'+lid).addClass('selected');
    barter_db_cal( bid );
}

/*
menu192		平穩
menu171		乾旱        11纖維 18寶石   25%
menu172		使節         5雜貨 13工藝品 25%
menu196		貴族        17香料  2調味料 25%
menu173		暴風         3家畜  8礦石  
menu190		內亂        19武器 12織物
menu194		害蟲         4醫藥品
menu191		不景氣

*/
//
function alert_box( alert_txt ) {
    $('#alert_box').html('<div class="alert_txt">'+alert_txt+'</div>').show();
}
//
function isMobile() {
   // 检测设备是否为移动设备
   if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){
      return true;
   }
   return false;
}
//
function fb_load() {
    FB.XFBML.parse(document.getElementById('idOfElementContainingFBML'));
}
//
function light_time() {
    //  UTC'+( UTC >= 0 ? '+' : '' )+UTC+' 
    var next_mon = (gMon+1) > 12 ? 1 : gMon+1;
    var lt = '<span>'+emoji_h[nHour]+'<em>'+add_zero(nHour)+':'+add_zero(nMin)+':'+add_zero(nSec)+'</em></span>';
        lt+= '<span>'+ em_time( 86400*7-(now-ChangeWeekTime), '⏳'+lang('menu84','','1'), 'week' ) +'</span>';
        lt+= '<span>'+ em_time( 86400-(now-ChangeDayTime), '⏳'+lang('menu85','','1') ) +'</span>';
        lt+= '<span>'+ em_time( 86400-(now-uSec0), '⏳'+ lang( 'mon'+gMon, '', '1' ) +'➧'+ lang( 'mon'+next_mon, '', '1' ) ) +'</span>';
    $('#light_time').html( lt );
}
function em_time( t, txt, type='' ) {
    var em_class = '';
    if( type == 'week' ) {
        var eD = Math.floor(         t / 86400 );
        var eH = Math.floor( (t%86400) / 3600 );
        var eM = Math.floor(  (t%3600) / 60 );
        if( eD == 0 ) em_class = 'notice';
        if( eD == 0 && eH <= 1 ) em_class = 'alert';
        return '<em class="'+em_class+'"><i>'+txt+'</i>'+eD+lang('menu86','','1')+add_zero(eH)+lang('menu87','','1')+add_zero(eM)+lang('menu88','','1')+'</em>';
    }
    var eH = Math.floor( t / 3600 );
    var eM = Math.floor( (t % 3600)/60 );
    var eS = t % 60;
    if( eH < 2 ) em_class = 'notice';
    if( eH < 1 ) em_class = 'alert';
    return '<em class="'+em_class+'"><i>'+txt+'</i>'+add_zero(eH)+':'+add_zero(eM)+':'+add_zero(eS)+'</em>';
}
//  url split
function url_split() {
    var lang_tmp = 0;
    $(window.location.hash.split('#')).each(function(i,h){
        k = h.split('=')[0];
        v = h.split('=')[1]
        if( k == 'lang' && typeof lang_set[v] !== 'undefined' ) {
            lang_tmp = 1;
            langNow = v;
            langG = lang_set[v];
            //  不是繁體的話 初次載入延遲更新
            if( langG !== 1 ) json_get( 'lang_'+langG, function(){ lang_reset() } );
        }
        if( k == 'x' ) transform.left = v;
        if( k == 'y' ) transform.top = v;
        if( k == 's' ) transform.scale = v;
        if( k == 't' ) queue(function(){ queue(function(){ box_right( v ); }); });
        if( k == 'm' ) queue(function(){ queue(function(){ $('#lt_menu li[data-menu="'+v+'"]').click(); }); });
    })
    // lang def
    if( lang_tmp == 0 ) {
        langC = cache('lang');
        if( langC == 0 ) langC = CheckLang();
        if( langC !== 0 && langC != langNow ) {
            langNow = langC;
            langG = lang_set[langC];
            lang_select( langC );
        }
    }
}
//
function url_hash( k, v ) {
    //  hash_def
    var hash_set = {'lang':'cht', 'x': -8500, 'y': -3300, 's': 2, 't': '', 'm': '' };
    //
    var hash_now = {};
    hash_now['lang'] = langNow;
    hash_now['x'] = Math.floor( transform['left'] ) || -1;
    hash_now['y'] = Math.floor( transform['top'] ) || -1;
    hash_now['s'] = transform['scale'];
    hash_now['t'] = CityNow;
    hash_now['m'] = $('#box_left').data('menu');
    if( k !== '' && typeof hash_set[k] !== 'undefined' ) hash_now[k] = v;

    //  transform
    var hash_url = '';
    $.each( hash_set, function( sk, sv ){
        if( hash_now[sk] ) hash_set[sk] = hash_now[sk];
        if( hash_set[sk] !== '' ) hash_url += '#' + sk + '=' + hash_set[sk];
    });
    // set hash
    history.pushState({}, null, hash_url);
}
//
function show_sea_lv() {
    var show_map = cache( 'show_map', null, {'def':'1'} );
    if( show_map != '1' ) {
        $('#layers .sea_lv').hide();
        return false;
    }
    if( $('#layers .sea_lv').length > 0 ) {
        $('#layers .sea_lv').show();
        return false;
    }
    //
    $.each( sea_lv_arr, function( i, sl ) {
        var sl_box = $('<div class="sea_lv"></div>');
            sl_box.css({'left':sl.x+'px','top':sl.y+'px'});
        $.each( sl.d, function( m, lv ) {
            sl_box.append('<div class="slv">'+ lang( m ) +'<b>'+ lv +'</b></div>');
        })
        $('#layers').append( sl_box );
    })
}

//
function ne2xy(N, E) {
    var x = Math.round( (E + 180) * (9972 / 360) - ( 9972/2-4670 ) );
    var radians = N * (Math.PI / 180);
    var mercatorN = Math.log(Math.tan((Math.PI / 4) + (radians / 2)));
    var y = Math.round( (5886 / 2) - (9972 * mercatorN / (2 * Math.PI)) - ( 5886/2-2960 ) );
    if( x < 0 ) x += 9972;
    return { x, y };
}
function xy2ne(x, y) {
    x += ( 9972/2-4670 );
    y += ( 5886/2-2960 );
    var e = (x / 9972) * 360 - 180;
    var mercatorN = ((5886 / 2) - y) / (9972 / (2 * Math.PI));
    var n = (Math.atan(Math.exp(mercatorN)) * 2 - Math.PI / 2) * (180 / Math.PI);
    n = Math.round( (n+Number.EPSILON)*100 ) / 100
    e = Math.round( (e+Number.EPSILON)*100 ) / 100
    if( e > 180 ) e -= 360;
    return { n, e };
}


class CanvasParticle {
    constructor(wx, wy, speed, wr, cwh=200, rd, co='' ) {
        if( speed == 'del' ) return;
        this.cwh = cwh * 1;
        this.clt = 50;
        if( this.cwh < 100 ) {
            this.cwh = 100;
            this.clt = 20;
        }
        this.wh = this.cwh / 2;
        this.wx = wx * 1;
        this.wy = wy * 1;
        this.speed = speed * 1;
        this.wr = wr * 1;
        this.rd = rd * 1;
        this.color = co == 'local' ? '#0000FF' : '#00ffff';
        this.dt = wind_rdt[wr];
        this.times = cwh / 200;
        this.t = 0;
        if( this.rd !== 0 ) {
            //this.clt = 100;
            //this.wh = cwh - this.clt * 2;
        }
        //
        var windid = 'wind_' + wx + '_' + wy;
        if( $('#'+windid).length > 0 ) $('#'+windid).remove();
        var wind = $('<canvas id="' + windid + '" class="wind windc" data-x="' + wx + '" data-y="' + wy + '" data-wr="' + wr + '" width="' + this.cwh + '" height="' + this.cwh + '"></canvas>')
            .css({ 'left': (wx - this.cwh/2) + 'px', 'top': (wy - this.cwh/2) + 'px' });
        var degrees = wr-135;
        var scaleXY = '';
        if( this.rd < 0 ) {
            this.rd = this.rd * -1;
            scaleXY = ' scaleY(-1)'; // scaleX(-1) 
        }
        wind.css({
            '-webkit-transform' : 'rotate('+degrees+'deg)'+scaleXY,
               '-moz-transform' : 'rotate('+degrees+'deg)'+scaleXY,  
                '-ms-transform' : 'rotate('+degrees+'deg)'+scaleXY,  
                 '-o-transform' : 'rotate('+degrees+'deg)'+scaleXY,  
                    'transform' : 'rotate('+degrees+'deg)'+scaleXY,  
        });
        $('#winds').append(wind);
        this.ctx = wind[0].getContext('2d');
        // button
        if ( co == 'local' || TestMode) {
            var wind_emoji = $('<div id="winde_'+wx+'_'+wy+'" class="wind emoji">🌬️</div>')
                .css({ 'left': (wx - 9) + 'px', 'top': (wy - 6) + 'px' })
                .on('click', function(e) { 
                    $('#wind_'+wx+'_'+wy).css({'background':'#CCC3'});
                    context_menu(e, { 'type': 'wind', 'x': wx, 'y': wy });
                })
            $('#city').append(wind_emoji);
        }
        // 生成粒子数组
        //var p_num = Math.floor( ( this.speed + 2 ) * this.times );
        this.particles = [];
        this.animateFrame = null;
        this.lastloopTime = 0;
        Gtmp['winds'][windid] = this;
    }
    // 
    draw() {
        this.ctx.lineWidth = 5; // 寬
        this.ctx.globalCompositeOperation = 'destination-in';
        this.ctx.fillRect(0, 0, this.cwh, this.cwh);
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.globalAlpha = 0.7;
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.color;
        this.particles.forEach((particle) => {
            this.ctx.moveTo(particle.x, particle.y); // 舊xy
            this.ctx.lineTo(particle.nextX, particle.nextY); // 新xy
        });
        this.ctx.stroke();
        this.ctx.closePath();
    }
    animate() {
        if( this.t < 100 ) {
            if( this.t % ( ( 10 - this.speed ) * 4 ) == 0 ) {
                var rx = Math.floor(Math.random() * this.wh);
                var ry = Math.floor(Math.random() * this.wh);
                if( this.rd != 0 ) {
                    rx = Math.floor(Math.random() * this.cwh / 2);
                    ry = Math.floor(Math.random() * this.cwh / 2);
                }
                this.particles.push( new Particle( rx, ry, this.speed, this.times, this.rd ) );
            }
            this.t++;
        }
        this.particles = this.particles.map((particle) => {
            particle.update();
            if (particle.lifetime < 0) {
                var rx = Math.floor(Math.random() * this.wh);
                var ry = Math.floor(Math.random() * this.wh);
                if( this.rd != 0 ) {
                    rx = Math.floor(Math.random() * this.cwh / 2);
                    ry = Math.floor(Math.random() * this.cwh / 2);
                }
                return new Particle( rx, ry, this.speed, this.times, this.rd );
            } else {
                return particle;
            }
        });
        this.draw();
    }
}
// Particle
class Particle {
    constructor(x, y, speed, times, rd) {
        this.x = x;
        this.y = y;
        this.r = 0;
        this.rd = rd;
        this.speed = speed;
        this.times = times;
        this.lifetime = Math.floor(50 * this.times + ((Math.random() * 50) / speed) * this.times);
        if( this.rd !== 0 ) this.lifetime += 50;
        this.speedX = 0;
        this.speedY = 0;
        this.nextX = this.x;
        this.nextY = this.y;
    }
    // 更新
    update() {
        this.x = this.nextX;
        this.y = this.nextY;
        if( this.rd == 0 ) {
            this.speedX = 2 + 2 * (Math.random() * 0.5) * this.speed * 0.2; // x方向增量
            this.speedY = 2 + 2 * (Math.random() * 0.5) * this.speed * 0.2; // y方向增量
        }else{
            this.r += this.rd;
            this.speedX = 3 * Math.cos( this.r * (Math.PI / 180) ) * this.speed * 0.2;
            this.speedY = 3 * Math.sin( this.r * (Math.PI / 180) ) * this.speed * 0.2;
        }
        this.nextX = this.x + this.speedX;
        this.nextY = this.y + this.speedY;
        this.lifetime--;
    }
}

// mon 9-12 > [9,10,11,12]
function mon_range( m ) {
    if( typeof m === 'undefined' ) return;
    var res = [];
    if( m.indexOf('-') != -1 ) {
        var mr = m.split('-');
        mr[0] = mr[0] * 1;
        mr[1] = mr[1] * 1;
        if( mr[1] < mr[0] ) mr[1] += 12;
        for( i=mr[0] ; i<=mr[1] ; i++ ){
            res.push( i > 12 ? i % 12 : i );
        }
    }else{
        res = [m*1];
    }
    return res;
}

function wind_checkbox() {
    var sw = cache( 'show_wind' );
    if( sw == 1 ) wind_set('show');
    if( sw == 0 ) wind_set('hide');
}
function wind_set(mon=-1) {
    //
    if( mon == 'show' ){ mon= 0;cache('WindShow',0); cache('show_wind',1);}
    if( mon == 'hide' ){ mon=-1;cache('WindShow',-1);cache('show_wind',0);}
    //
    if( !mon ) mon = gMon;
    mon = mon * 1;
    //
    $('.wind').remove();
    Gtmp['winds'] = {};
    Gtmp['ShowInScreen'] = {};
    if( mon == -1 ) return $('#wind_mon').html('<table class="seasons"><tr><td class="emoji" onclick="wind_set(\'show\')">🎏</td></tr></table></li>');
    //
    if( typeof json_winds === 'undefined' ) return json_get( 'json_winds', function(){ wind_set(mon); } );
    //  wind_mon button
    var ss_td = '';
    for(i=1;i<13;i++) {
        ss_td += '<td class="ssmon '+ ( i == mon ? 'thisMon' : '' ) +'" onclick="wind_set('+i+')">'+ lang( 'mon'+i ) +'</td>';
    }
    $('#wind_mon').html('<table class="seasons"><tr><td class="emoji thisMon" onclick="wind_set(\'hide\')">🎏</td>'+ ss_td +'</tr></table></li>');
    //
    $.each( json_winds, function(k,w){
        var mo = w[5];
        if( mo !== '0' && mon_range( mo ).indexOf(mon) == -1 ) return;
        new CanvasParticle( w[0], w[1], w[2], w[3], w[4], w[6] );
    })
    //  
    if( !ToolMode ) return;
    $.each( localStorage, function(k,w){
        if( k.indexOf('wind_') == 0  ) {
            var w  = cache( k ).split(',');
            var sp = w[2];
            if( sp == 'del' ) {
                var x = w[0];
                var y = w[1];
                $('#wind_'+x+'_'+y).remove();
                $('#winde_'+x+'_'+y).remove();
                Gtmp['winds']['wind_'+x+'_'+y] = null;
                return;
            }
            var mo = w[5];
            if( typeof mo === 'undefined' ) return;
            if( mo !== '0' && mon_range( mo ).indexOf(mon) == -1 ) return;
            var rd = w[6] || 0;
            //
            new CanvasParticle( w[0], w[1], w[2], w[3], w[4], rd, 'local' );
        }
    })
}

//
function close_context() {
    $('#contextMenu').hide();
    Box_Context_Show == 0;
    context_over = false;
    nowheel_over = false;
}
//
function context_menu( e, arr={'type':''} ) {
    e.preventDefault();
    //
    var context = $('#contextMenu').html('');
    var wind_edit = false;
    $('#ping_mouse').hide();
    //
    var show_todo = cache( 'show_todo_list', null, {'def':'1'} );
    if( arr['type'] == 'city' ) {
        if( show_todo == '1' ) {
            var cityid = arr['cityid'];
            context.append( $('<li>'+langN(cityid)+'</li>').click( function(){ box_right( cityid ); }) );
            //  add todo_list
            if( json_city[cityid].o != 'n' ) context.append( $('<li>'+lang('menu77')+': '+lang('menu89')+'</li>').click( function(){ show_todo_list( '', '['+langN(cityid)+'] '+langN('menu89') ); }) );
            if( typeof city_shipitems[cityid] !== 'undefined' ) context.append( $('<li>'+lang('menu77')+': '+lang('menu90')+'</li>').click( function(){ show_todo_list( '', '['+langN(cityid)+'] '+langN('menu90') ); }) );

            context
                .append( $('<li>'+lang('menu77')+': '+lang('menu91')+'</li>').click( function(){ show_todo_list( '', '['+langN(cityid)+'] '+langN('menu91') ); }) )
                .append( $('<li>'+lang('menu77')+': '+lang('menu92')+'</li>').click( function(){ show_todo_list( '', '['+langN(cityid)+'] '+langN('menu92') ); }) )
                .append( $('<li>'+lang('menu77')+': '+lang('menu93')+'</li>').click( function(){ show_todo_list( '', '['+langN(cityid)+'] ', function(){ $('#todo_list ul').click() } ); }) )
        }
    }else if( arr['type'] == 'pop' ) {
        if( show_todo == '1' ) {
            var zoneid = arr['zoneid'];
            var popid = arr['popid'];
            var hm = arr['hm'];
            if( popid == 'no'  ) {
                context.append( $('<li>['+lang(zoneid)+']['+hm+'] '+lang('menu58')+'</li>') )
            }else{
                context
                    .append( $('<li>['+lang(zoneid)+'] '+lang('menu58')+'</li>') )
                    .append( $('<li>'+lang('menu77')+': ['+lang(zoneid)+']['+hm+'] '+lang(popid)+' '+lang('menu58')+'</li>').click( function(){ show_todo_list( '', '['+langN(zoneid)+']['+hm+'] '+langN(popid)+' '+langN('menu58')+'' ); }) )
                    .append( $('<li>'+lang('menu77')+': ['+lang(zoneid)+'-'+lang(popid)+'] '+lang('menu58')+' ('+lang('menu153')+')</li>').click( function(){ show_todo_list( '', '['+langN(zoneid)+'-'+langN(popid)+']' ); }) )
            }
        }
    }else if( arr['type'] == 'discov' ) {
        if( show_todo == '1' ) {
            var disid = arr['disid'];
            context.append( '<li>disid: '+ disid +'</li>' )
        }
    }else if( arr['type'] == 'no' ) {
        context.append( '<li></li>' );
    }else if( arr['type'] == 'wind' ) {
        var x = arr['x'];
        var y = arr['y'];
        var w = wind_load( x, y );
        Gtmp['wind_sp'] = w['sp'];
        Gtmp['wind_sz'] = w['sz'];
        Gtmp['wind_wr'] = w['wr'];
        Gtmp['wind_mo'] = w['mo'] || gMon;
        Gtmp['wind_rd'] = w['rd'] || 0;
        wind_edit = true;
        context.append( $('<li class="wind_edit">Edit: '+x+','+y+'</li>').click(function(){ close_context(); $('#wind_'+x+'_'+y).css({'background':'none'}); }) );
    }else{
        var x = Math.floor( ( transform.left*-1 + e.pageX ) / transform.scale ) +15;
        var y = Math.floor( ( transform.top*-1  + e.pageY ) / transform.scale ) -10;
        var gps = xy2ne( x, y );
        //  ping
        ping_there( 'ping_mouse', x, y );
        //
        context
            .append( $('<li>'+lang('menu77')+': '+lang('menu94')+'</li>').click( function(){ show_todo_list( '', '['+ x +','+ y +'] '+langN('menu94')+'' ); close_context() }) )
            .append( $('<li>'+lang('menu77')+': '+lang('menu93')+'</li>').click( function(){ show_todo_list( '', '['+ x +','+ y +'] ', function(){ $('#todo_list ul').click() } ); close_context() }) )
            .append( '<li>'+lang('menu95')+': <span class="menu_xy">'+ gps.n +'﹐'+ gps.e +' (測試中)</span></li>' )
            .append( '<li>'+lang('menu95')+': <input class="menu_xy" value="'+ x +'﹐'+ y +'" onclick="this.select();document.execCommand(\'copy\');"></li>' )

        if( ToolMode ) wind_edit = true;
    }

    //
    if( wind_edit ) {
        var td_1 = '風速<input id="sp" value="'+( Gtmp['wind_sp'] ? Gtmp['wind_sp'] : 3 )+'">'
                  +'範圍<input id="sz" value="'+( Gtmp['wind_sz'] ? Gtmp['wind_sz'] : 300 )+'">';
        var td_2 = '月份<input id="mo" value="'+( Gtmp['wind_mo'] ? Gtmp['wind_mo'] : gMon )+'">'
                  +'彎度<input id="rd" value="'+( Gtmp['wind_rd'] ? Gtmp['wind_rd'] : 0 )+'">';
        var td_3 = '<input id="save" type="button" value="Save"><input id="wr" value="'+( Gtmp['wind_wr'] ? Gtmp['wind_wr'] : '' )+'" type="hidden">';
        if( wind_edit ) td_3 += '<input id="del" type="button" value="Del">';
        var wind_box = $('<table>'
                  +'<tr><td>NW</td>   <td>NNW</td>      <td>N</td>      <td>NNE</td>    <td>NE</td> </tr>'
                  +'<tr><td>WNW</td>  <td colspan="3" class="wm">'+ td_1 +'</td>        <td>ENE</td></tr>'
                  +'<tr><td>W</td>    <td colspan="3" class="wm">'+ td_2 +'</td>        <td>E</td>  </tr>'
                  +'<tr><td>WSW</td>  <td colspan="3" class="wm">'+ td_3 +'</td>        <td>ESE</td></tr>'
                  +'<tr><td>SW</td>   <td>SSW</td>      <td>S</td>      <td>SSE</td>    <td>SE</td> </tr>'
                  +'</table><div id="wind_alert"></div>')
            .on('keydown', function (e) {
                var code = e.which || e.keyCode;
                if( code === 13 ) { $('#save').click();e.preventDefault(); }    // enter
            })
            .on('click', 'input', function(e) {
                var btnid = $(this).attr('id');
                if( btnid == 'del' ) {
                    wind_save( x, y, 'del' );
                    $('#wind_'+x+'_'+y).remove();
                    $('#winde_'+x+'_'+y).remove();
                    Gtmp['winds']['wind_'+x+'_'+y] = null;
                    //
                    Gtmp['ShowInScreen'] = {};
                    close_context();
                    return false;
                }
                if( btnid == 'save' ) {
                    //  x y
                    var sp = $('#sp').val();
                    if( sp < 1 || sp > 9 ) { $('#wind_alert').html('風速 1~9'); return false; }
                    var sz = $('#sz').val();
                    if( sz < 100 || sz > 1200 ) { $('#wind_alert').html('範圍100~1200'); return false; }
                    if( $('#wr').val() == '' ) { $('#wind_alert').html('未選擇風向'); return false; }
                    var wr = ($('#wr').val()*1) % 360;
                    var rd = $('#rd').val();
                    if( rd < -3 || rd > 3 ) { $('#wind_alert').html('彎度 -3~3'); return false; }
                    var mo = $('#mo').val();
                    //
                    Gtmp['wind_sp'] = sp;
                    Gtmp['wind_sz'] = sz;
                    Gtmp['wind_mo'] = mo;
                    Gtmp['wind_wr'] = wr;
                    Gtmp['wind_rd'] = rd;
                    //
                    //console.log( x, y, sp, wr, sz, mo );
                    wind_save( x, y, sp, wr, sz, mo, rd );
                    new CanvasParticle( x, y, sp, wr, sz, rd, 'local' );
                    //
                    Gtmp['ShowInScreen'] = {};
                    close_context();
                    $('.ping_there').hide();
                    return false;
                }
                $(this).select();
                $('#wind_alert').html('');
                return false;
            })
            .on('click', 'td', function(e) {
                if( $(this).attr('colspan') == '3' ) return;
                $('.wind_set td').removeClass('selected');
                $(this).addClass('selected');
                $('#wr').val( wind_dtr[$(this).html()] );
                $('#wind_alert').html('');
            })
        //
        context.append( $('<li class="wind_set"></li>').append( wind_box ) );
        //
        if( wind_edit ) {
            context
                .append( '<li class="wind_export_box"><textarea id="wind_export" onclick="this.select();"></textarea></li>' )
                .append( $('<li class="wind_export_box">清除所有自訂風向 *無法恢復</li>').click(function(){
                    $.each( localStorage, function(k,v){ if( k.indexOf('wind_') == 0 ) $.removeLocalStorage( k ); })
                    $('#wind_export').html('已清除!');
                    wind_set();
                }))
                .append( $('<li class="wind_edit">匯出全部自訂風向</li>').click(function(){
                    var wind_txt = '';
                    for (var i = 0; i < localStorage.length; i++) {
                        var k = localStorage.key(i);
                        var v = localStorage.getItem( k );
                        if( k.indexOf('wind_') == 0 ) wind_txt += v + "\n";
                    }
                    $('#wind_export').html( wind_txt );
                    $('.wind_export_box').show();
                    $(this).hide();
                }))
        }
        //
        if( Gtmp['wind_wr'] ) $('#contextMenu td').filter(function() { return $(this).html() === wind_rdt[Gtmp['wind_wr']]; }).addClass('selected');
    }

    //
    Box_Context_Show = 1;
    context
        .css({ left: e.pageX, top: e.pageY })
        .on( 'mouseover', function(){ context_over = true; })
        .on( 'mouseout', function(){ context_over = false; })
        .show()
    return false;
}

function wind_save( x, y, sp, wr, sz, mo, rd ) {
    var key = 'wind_'+x+'_'+y;
    return cache( key, [x, y, sp, wr, sz, mo, rd].join(',') );
}
function wind_load( x, y ) {
    var key = 'wind_'+x+'_'+y;
    var res = cache( key );
    var w = res !== '0' ? res.split(',') : json_winds[key];
    return { 'x':w[0], 'y':w[1], 'sp':w[2], 'wr':w[3], 'sz':w[4], 'mo':w[5], 'rd':w[6] };
}

//
//  
function seasave_set() {
    if( cache( 'show_seasave_box', null, {'def':'1'} ) != '1' ) {
        $('#city .seasave ').hide();
        return false;
    }
    //
    $.each( save_arr, function( saveid, ss ) {
        var msg = $('<div></div>')
            .append( '<div>' + lang( ss.t == 1 ? 'menu214' : 'menu215' ) + ' <span class="ne"> ( '+ss.n+', '+ss.e+' )</span></div>' )
            .append( lang( saveid+'_req', 'translate', '' , '' ) )
            
        var icon = $('<div id="'+ saveid +'" class="seasave '+saveid+' noselect t'+ss.t+'" style="left:'+ss.x+'px;top:'+ss.y+'px;"><em class="emoji">🔔</em></div>')
            .on( 'mouseover', function(){ clearTimeout( TO_light );  })
            .on( 'mouseout' , function(){ clearTimeout( TO_light ); TO_light = setTimeout(function(){ $('#light_box').fadeOut(200) }, 500); })
            .on( 'click'    , function(){ msgbox_light( this, msg, 'menu216' ) })
        $('#city').append( icon );
    });
    return true;
}   

//
function msgbox_light( dthis, msg, dtype='' ) {
    //
    var light_box = $('#light_box').html('').attr('class','light_discov');
    if( dtype !== '' ) light_box.append( '<h6>'+lang( dtype )+'</h6>' );
    light_box.append( msg );
    //
    var dL = parseInt( $(dthis).css('left') );
    var dT = parseInt( $(dthis).css('top') );
    if( TestMode ) {
        var txt = dL + ', ' + dT;
        light_box.append('<div><textarea style="width:245px;height:30px;">'+txt+'</textarea></div>');
    }
    //
    var cH = light_box.height();
    var cT = $(dthis).offset().top;
    if( ( cT + cH ) > $(window).height() ) cT = $(window).height() - cH - 20;
    var cL = $(dthis).offset().left + ( 20*transform.scale );
    light_box
        .css({top: cT, left: cL})
        .show()
    arrow_there( dL-6, dT-10, 16 );
}

//
function show_todo_list( i_gou='', add='', callback ) {
    var show_tl = cache( 'show_todo_list', null, {'def':'1'} );
    if( show_tl != '1' ) {
        Box_TodoList_Show = 0;
        $('#todo_list').hide();
        return false;
    }
    Box_TodoList_Show = 1;
    var todo_list = $('#todo_list').html('')
            .on('DOMMouseScroll onwheel mousewheel onmousewheel wheel', function(e){ e.preventDefault(); return false; })
            .on( 'mouseover', function(){ nowheel_over = true })
            .on( 'mouseout', function(){ nowheel_over = false })

    var todo_list_arr = JSON.parse( decodeURIComponent( cache( 'todo_list' ) ) );
    if( todo_list_arr == 0 || todo_list_arr.length < 1 ) todo_list_arr = [''];
    var re24 = ( ( now - cache( 'todo_list_Sec0' ) ) >= 86400 ); // 判斷是否過0點    //  cache( 'todo_list_Sec0', nSec0 );
    //  del
    if( i_gou !== '' ) {
        todo_list_arr.splice( i_gou, 1 );
        cache( 'todo_list', encodeURIComponent( JSON.stringify( todo_list_arr ) ) );
    }
    //  add
    if( add !== '' ) {
        todo_list_arr.push( add );
        cache( 'todo_list', encodeURIComponent( JSON.stringify( todo_list_arr ) ) );
    }
    //
    var list_def = false;
    if( todo_list_arr == '0' || todo_list_arr.length == 0 || ( todo_list_arr.length == 1 && todo_list_arr[0] == '' ) ) { 
        list_def = true;
        todo_list_arr = [langN('menu77')];
    }
    //  
    if( typeof Gtmp['trade2id'] === 'undefined' ) Gtmp['trade2id'] = lang_js[langG]['trade_id'];
    //  ul
    var cache_updata = false;
    var todo_ul = $('<ul class="todo_ul"></ul>');
    $.each( todo_list_arr, function( ti, txt ){ 
        if( txt == '' ) return;
        //  [城市][地區][地區-流行]
        var matches = txt.match( /\[(.*?)\]/g );
        if( matches !== null ) {
            for( var i = 0 ; i < matches.length ; i++ ) {
                var match = matches[i].substring( 1, matches[i].length-1 );
                var match2 = '';
                if( match == '' ) return;
                if( match.indexOf('-') > 0 ) {
                    var z_p = match.split('-');
                    match = z_p[0];
                    match2 = z_p[1];
                }
                if( Gtmp['city2id'][match] ) {
                    var cityid = Gtmp['city2id'][match];
                    var txt_a = '<a class="go" onclick="city_go(\''+cityid+'\');event.cancelBubble=true;"><img src="/img/common/citygo2.png" />'+ matches[i] +'</a>';
                    txt = txt.replace( matches[i], txt_a );
                }else if( Gtmp['trade2id'][match] ) {
                    var tid = Gtmp['trade2id'][match];
                    var txt_a = '<a class="emoji go" onclick="trade_info_show(\''+tid+'\');event.cancelBubble=true;">⚖️'+ matches[i] +'</a>';
                    txt = txt.replace( matches[i], txt_a );
                }else if( Gtmp['pzone2id'][match] ) {
                    var zoneid = Gtmp['pzone2id'][match];
                    if( typeof zoneid === 'undefined' ) return;
                    var txt_a = '<a class="go" onclick="pzone_go(\''+zoneid+'\');event.cancelBubble=true;"><img src="/img/common/citygo2.png" />'+ matches[i] +'</a>';
                    txt = txt.replace( matches[i], txt_a );
                    if( Gtmp['pop2id'][match2] ) {
                        var popid = Gtmp['pop2id'][match2];
                        if( typeof popid === 'undefined' ) return;
                        var popH = '';
                        var span_class = 'time_over';
                        var pzd = pop_zone[zoneid].d;
                        $.each( Gtmp.pops[pop_zone[zoneid].z], function(i,v){
                            if( nHour == v[0] && v[1].indexOf(popid) != -1 ) { span_class += ' nowH'; }
                            if( nHour > v[0] || ( nHour == v[0] && ( nMin*60+nSec) > pzd ) ) return;
                            if( v[1].indexOf(popid) != -1 ) { popH = v[0]; return false; }
                        })
                        var pzH = popH >= 24 ? add_zero( popH - 24 ) : popH;
                        if( popH != '' ) txt = '[<span class="'+span_class+'" data-th="'+popH+'" data-tm="0" data-ts="'+pzd+'" data-type="pop">loading...</span>] ' + emoji_h[pzH*1] + add_zero( pzH*1 ) +':'+ add_zero( pzd/60 ) + txt;
                    }
                }
            }
        }
        //  [x,y]
        var matches = txt.match( /\[(\d+,\d+)\]/g );
        if( matches !== null ) {
            for( var i = 0 ; i < matches.length ; i++ ) {
                var match_xy = matches[i].substring( 1, matches[i].length-1 ).split(',');
                var x = parseInt( match_xy[0] );
                var y = parseInt( match_xy[1] );
                if( match != '' && x > 0 && y > 0 ) {
                    var txt_a = '<a class="go" onclick="ping_there( \'ping_todo\', '+x+', '+y+', \'go\' );event.cancelBubble=true;"><img src="/img/common/citygo2.png" />'+matches[i]+'</a>';
                    txt = txt.replace( matches[i], txt_a );
                }
            }
        }
        //  [22:22] [22:22:22] [+22:22] 
        var matches = txt.match( /\[(\+?\d+:\d+(:\d+)?)\]/g );
        if( matches !== null ) {
            for( var i = 0 ; i < matches.length ; i++ ) {
                var match_hm = matches[i].substring( 1, matches[i].length-1 ).split(':');
                if( match_hm[0][0] == '+' ) {
                    var newHour = parseInt( match_hm[0] ) + nHour;
                    var newMin  = parseInt( match_hm[1] ) + nMin;
                    todo_list_arr[ti] = todo_list_arr[ti].replace( match_hm[0]+':'+match_hm[1], newHour+':'+newMin );
                    match_hm[0] = newHour;
                    match_hm[1] = newMin;
                    cache_updata = true;
                }
                var th = parseInt( match_hm[0] );
                var tm = parseInt( match_hm[1] );
                if( tm >= 60 ) {
                    th += Math.floor( tm/60 );
                    tm = tm%60;
                    todo_list_arr[ti] = todo_list_arr[ti].replace( match_hm[0]+':'+match_hm[1], th+':'+tm );
                    cache_updata = true;
                }
                if( re24 && th > 24 ) {
                    var th24 = th-24;
                    todo_list_arr[ti] = todo_list_arr[ti].replace( th+':'+tm, th24+':'+tm );
                    th = th24;
                    cache_updata = true;
                }
                var ts = parseInt( ( typeof match_hm[2] !== 'undefined' ) ? match_hm[2] : 0 );
                if( match != '' ) {
                    //  em_time( 300, '' );
                    var txt_a = '[<span class="time_over" data-th="'+th+'" data-tm="'+tm+'" data-ts="'+ts+'">'+match_hm.join(':')+'</span>]';
                    txt = txt.replace( matches[i], txt_a );
                }
            }
        }
        //
        var todo_li = $('<li></li>');
            if( !list_def ) todo_li.append( $('<a class="todo_check"><span class="have gou_gou"></span></a>').click(function(){ show_todo_list( ti ); }) );
            todo_li.append( txt );
        todo_ul.append( todo_li );
    } )
    if( cache_updata ) {
        cache( 'todo_list', encodeURIComponent( JSON.stringify( todo_list_arr ) ) );
        if( re24 ) cache( 'todo_list_Sec0', nSec0 );
    }
    //  textarea
    todo_ul.on( 'click', function(){
        var ul_width = $(this).width();
        var todo_textarea = $('<textarea></textarea>');
        todo_textarea
            .val( todo_list_arr.filter(v=>v).join("\n") )
            .on( 'blur', function() {
                var txt_arr = $(this).val().replace(/\(/g, '（').replace(/\)/g, '）').split(/[(\r\n)\r\n]+/);
                cache( 'todo_list', encodeURIComponent(JSON.stringify( txt_arr )) );
                cache( 'todo_list_Sec0', nSec0 );
                show_todo_list();
            })
            .height(todo_list_arr.length*20)
            .width(ul_width)
            .on('keyup keypress', function(e) {
                var code = e.which || e.keyCode;
                if (e.ctrlKey && code === 13) { $(this).blur();e.preventDefault(); }    // ctrl + enter
                $(this).height(0);
                $(this).height(this.scrollHeight);
            })
        nowheel_over = true;
        todo_list.html( todo_textarea );
        $('#todo_list textarea').focus();
    } )
    //
    nowheel_over = false;
    todo_list.html( todo_ul ).show();
    box_resize();
    //
    if( typeof callback == 'function' ) callback();
}
//
function light_box_show( lthis, lclass, lhtml ) {
    if( lthis.hasClass('nolight') ) return false;
    if( lhtml === false || lhtml === '' ) return false;
    var light_box = $('#light_box').attr('class', lclass).html( lhtml ).show();
    var cH = light_box.height();
    var cW = light_box.width();
    var cT = lthis.offset().top + 10;
    var cL = lthis.offset().left - 300;
    if( cL < 0 ) {
         cL = cL + 365;
        //  box_left list_mode
        if( $('#box_left').hasClass('list_mode') ) {
            if( lthis.hasClass('in_left_box') ) {
                cT = lthis.offset().top;
                cL = 340;
            }
        }
    }
    if( ( cT + cH ) > $(window).height() ) cT = cT - cH + 40;
    if( cT < 0 ) cT = 0;
    if( ( cL + cW ) > $(window).width() ) {
        cL = 0;
        cT = 0;
    }
    //
    light_box.css({top: cT, left: cL});
}
//
function fade_box_show( lthis, lclass, lhtml ) {
    if( lhtml === false || lhtml === '' ) return false;
    var light_box = $('#light_box').attr('class', lclass).html( lhtml ).show();
    var cT = lthis.offset().top;
    var cL = lthis.offset().left;
    light_box.css({top: cT, left: cL});
}
//  
function img_src( imgtype, imgid, iver ) {
    //
    var imgarr = {};
    if( imgtype == 'char'   ) imgarr = json_char[imgid];
    if( imgtype == 'trade'  ) imgarr = trades[imgid];
    if( imgtype == 'discov' ) imgarr = discovery[imgid];
    if( imgtype == 'skill'  ) imgarr = skill_arr[imgid];
    //
    if( typeof imgarr.i   !== 'undefined' ) imgid = imgarr.i;
    if( typeof imgarr.ver !== 'undefined' ) iver  = imgarr.ver;
    if( imgtype == 'skill' && imgid.length > 11  ) imgid = imgid.substring(0, 11);
    //
    var src = '/img/'+ imgtype +'/uwo_'+ imgid +'.png';
    if( typeof iver !== 'undefined' ) src += '?ver='+iver;
    return src;
}

//$('#map').prop('src', 'https://voyage.tw/img/map.webp');
//1 有色塊
//  https://imgur.com/9NKtSvL
//  https://i.voyage.tw/9NKtSvL.jpg
//0 無色塊
//  https://imgur.com/gO9PS6P
//  https://i.voyage.tw/gO9PS6P.jpg
//
function show_map() {
    map = null;
    map = $('#map');
    var show_map = cache( 'show_map', null, {'def':'1'} );
    if( show_map == '1' ) {
        map.attr('src', 'https://i.voyage.tw/9NKtSvL.jpg')
           .on('error', function () { $(this).attr('src', 'https://i.imgur.com/9NKtSvL.jpg') })
    }else{
        map.attr('src', 'https://i.voyage.tw/gO9PS6P.jpg')
           .on('error', function () { $(this).attr('src', 'https://i.imgur.com/gO9PS6P.jpg') })
    }
    //
    show_sea_lv();
}
//
function check_ver() {
    if( typeof last_ver === 'undefined' ) return false;
    if( parseInt( last_ver ) > parseInt( ver ) ) alert_box('<a href="javascript:location.reload();">'+ lang('menu74') +'</a>');
    if( parseInt( last_ver_lang ) > parseInt( ver_lang ) ) alert_box('<a href="javascript:location.reload();">'+ lang('menu74') +'</a>');
}
//
function queue( func ) {
    if( typeof func === 'function' ) queue_arr.push( func );
}
// 回圈
var queue_arr = [];
var nDate = new Date();
var now   = parseInt( nDate / 1000 );
var nHour = nDate.getHours();
var nMin  = nDate.getMinutes();
var nSec  = nDate.getSeconds();
var nSec0 = now - ( nHour*3600 + nMin*60 + nSec ); // local 00:00
var uDay  = nDate.getUTCDay();
var uHour = nDate.getUTCHours();
var uSec0 = now - ( uHour*3600 + nMin*60 + nSec ); // utc 00:00
var UTC   = nHour - uHour;
var gMon  = Math.floor( ( now - 1682640000 ) / 86400 ) % 12;
    if( gMon == 0 ) gMon = 12;
var now1, now3600;
//var loop_pre_sec = 10;
//var loop_min_time = (1000/60) * (60 / loop_pre_sec) - (1000/60) * 0.5;
var loop_min_time3  =325;   // fps 3
var loop_min_time6  =158;   // fps 6
var loop_min_time10 = 91;   // fps 10
var loop_min_time12 = 75;   // fps 12
var loop_min_time16 = 54;   // fps 16
var loop_min_time24 = 33.3; // fps 24

var lastloopTime = 0;
var loop_min_time   = loop_min_time10; // loop()
var overtime_reset = false;
function loop(loopTime) {
    //  set loop per sec
    if( loopTime-lastloopTime < loop_min_time ) {
        requestAnimationFrame(loop);
        return;
    }
    //  
    lastloopTime = loopTime;
    // 现在秒数
    nDate = new Date();
    now   = parseInt( nDate / 1000 );
    // 每隔一秒
    if( now != now1 ) {
        // 判斷切分頁造成的delay
        var n1s = now - now1;
        if( n1s > 10 ) {
            //  超過一小時才回來 更新
            if( nDate.getUTCHours() != uHour ) overtime_reset = true;
        }
        // 更新現在秒數
        now1 = now;
        nSec = nDate.getSeconds();
        // 每 分鐘0秒時 執行
        if( nSec == 0 || overtime_reset ) {
            nMin  = nDate.getMinutes();
            check_ver();    // check ver
        }
        // 每 整點0分0秒時 執行
        if( ( nMin == 0 && nSec == 0 ) || overtime_reset ) {
            uHour = nDate.getUTCHours();
            nHour = nDate.getHours();
            // 台灣23點刷新 = 韓國24點 = UTC 15點
            if( uHour == 15 || overtime_reset ) {
                set_change_time();
                queue( function(){ $('.loading').show() } );
                queue( function(){ city_set() } );
                queue( function(){ pop_set() } );
                queue( function(){ discov_set() } );
                queue( function(){ tzone_set() } );
                queue( function(){ seasave_set() } );
                queue( function(){ wind_set() } );
                queue( function(){ Gtmp['ShowInScreen'] = {} } );
                queue( function(){ $('.loading').hide() } );
                $('#lt_menu .tip').addClass('red');
            }
            // UTC 0:0:0 更新 uSec0 uDay gMon 換月
            if( uHour == 0 || overtime_reset ) {
                uSec0 = now - ( uHour*3600 + nMin*60 + nSec ); // utc 00:00
                uDay = nDate.getUTCDay();
                gMon = Math.floor( ( now - 1682640000 ) / 86400 ) % 12;
                if( gMon == 0 ) gMon = 12;
                // 遊戲換月 更新風向
                queue( function(){ wind_set(); });
            }
            // 當地時間 0 點
            if( nHour == 0 || overtime_reset ) {
                nSec0 = now - ( nHour*3600 + nMin*60 + nSec ); // local 00:00
                queue( function(){ show_todo_list(); });
            }
        }
        // 每隔 10秒 執行
        if( nSec%10 == 0 ) {
            babala_say();
        }
        // 每 過60 分
        if( ( now - now3600 ) > 3600 ) {
            now3600 = now;
        }
        // 每秒執行
        // 更新 城市時間/倒數計時
        light_time();
        ShowTime();
    }
    //  queue
    if( queue_arr.length > 0 ) queue_arr.shift()();
    overtime_reset = false;
    // 重複執行 loop
    requestAnimationFrame(loop);
}
var lastAnimeTime   = 0;
var anime_min_time  = loop_min_time12; // wind frame()
function loop_animate(animeTime) {
    //  地圖縮小低於0.5則不更新
    if( transform.scale < 0.5 || mousedown !== null ) { requestAnimationFrame(loop_animate); return; }
    if( animeTime-lastAnimeTime < anime_min_time ) { requestAnimationFrame(loop_animate); return; }
    lastAnimeTime = animeTime;
    if( typeof Gtmp['ShowInScreen']['wind'] === 'undefined' ) ShowInScreen( 'wind', '.windc' );
    $.each( Gtmp['ShowInScreen']['wind'], function( i, v ){
        if( v == 'end' ) return;
        if( typeof Gtmp['winds'][v] === 'undefined' ) { console.log( i,v );return; }
        Gtmp['winds'][v].animate();
    })
    // 重複執行 loop_animate
    requestAnimationFrame(loop_animate);
}
//
var TO_icon;
function transicon( lang ) {
    if( cache('show_translate', null, {'def':'1'}) !== '1' ) return false;
    //
    clearTimeout( TO_icon );
    var ltop  = lang.offset().top;
    var lleft = lang.offset().left - 24;
    //
    if( lang.hasClass('titop') || lleft < 0 ) {
        ltop  = lang.offset().top - lang.height() - 3;
        lleft = lang.offset().left;
        if( ltop < 0 ) ltop  = lang.offset().top + lang.height() + 2;
    }
    //
    var lkey = lang.attr('lang');
    var url = '/translate/?k='+lkey+'&l='+langNow+'&t='+Wing
    $('#transicon a')
        .attr('href',url)
        .click(function(){
            $('#report_box iframe').attr('src',url);
            $('#report_box').show();
            return false;
        });
    $('#transicon span').html( langN('menu156') );
    $('#transicon').show()
        .offset({top: ltop, left: lleft})
    Box_Report_Show = 1;
}
//
function box_report_close() {
    Box_Report_Show = 0;
    $('#report_box').hide();
    $('#report_iframe').attr('src','');
}

// Konami Wing
var global = {
    konami: function() {
        var konamikeys = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65], started = false, count = 0;
        $(document).keydown(function(e) {
            var reset = function() {
                started = false;
                count = 0;
                return;
            };
            key = e.keyCode;
            if (!started) {
                if (key == 38) started = true;
            }
            if (started) {
                if (konamikeys[count] == key) {
                    count++;
                } else {
                    reset();
                }
                if (count == 10) {
                    konami_pass()
                    reset();
                }
            } else {
                reset();
            }
        });
    }
};
function konami_pass() {
    cache('Wing', now);
    Wing = true;
    json_get('konami');
}
//
var langC;
var TO_light;
var touchstartY = 0;
var touchendY = 0;
var touchendT = 0;
var nowheel_over = false;
var context_over = false;
if( TestMode ) {
    Gtmp['TestMode'] = true;
    TestMode = cache('testmode', null, {'def':false});
}
$(document).ready(function() {
    set_change_time();
    //
    show_map();
    //  url split
    url_split();
    //
    queue( function(){ city_set() } );
    queue( function(){ pop_set() } );
    queue( function(){ discov_set() } );
    queue( function(){ tzone_set() } );
    queue( function(){ seasave_set() } );
    //
    queue( function(){ show_babala() } );
    queue( function(){ show_todo_list() } );
    queue( function(){ wind_set() } );
    queue( function(){ Gtmp['ShowInScreen'] = {} } );
    queue( function(){ $('.loading').hide() } );
    queue( function(){ if( langN('menu150') !== '-' ) $('#notice').html( langN('menu150') ).show(); } );

    //
    $('#lt_menu .menu_btn').click(function(){
        //
        $('#lt_menu .menu_btn').removeClass('selected');
        $(this).addClass('selected');
        //
        var menu = $(this).data('menu');
        var box_menu = $('#box_left').data('menu');
        if( menu == box_menu ) {
            $('#box_left').data('menu', '');
            $(this).removeClass('selected');
            left_box_close();
        }else{
            $('#box_left').data('menu', menu);
            if( $('#box_left').offset().left == 0 ) {
                $('#box_left').animate({ left: -360, opacity: 0 }, 100 );
                //
                Box_Tool_Show = 0;
                Box_Left_Now = '';
                $('#box_tool').hide();
            }
            //  load box_left
            box_left_load( menu );
        }
    });
    
    $('.fly_box')
    .on( 'click', '.h5_btn', function(){
        var bid = $(this).data('bid');
        if( $('#'+bid).css('display') == 'none' ) {
            cache( 'box_hide.'+bid , '0' );
            $(this).children('.show').removeClass( 'show' ).addClass( 'hide' );
            $('#'+bid).slideDown();
            if( bid == 'city_comments_main' ) queue( function(){ fb_load() } );
        }else{
            cache( 'box_hide.'+bid , '1' );
            $(this).children('.hide').removeClass( 'hide' ).addClass( 'show' );
            $('#'+bid).slideUp();
        }
    })
    .on( 'click', '.char .thumb', function(e){
        if( isMobile() ) {
            //  手機模式
            if( $(this).hasClass('nolight') == false ) {
                var charid = $(this).data('charid');
                char_info_show( charid );
                return false;
            }
        }
        e.preventDefault();
        var charid = $(this).data('charid');
        //  add/remove Class
        var res = have( charid, true );
        $('#box_char .'+charid).toggleClass('gou_gou', ( res == 'gou' ) );
        $('.'+charid+' .have').toggleClass('gou', ( res == 'gou' ) );
    })
    .on( 'mouseover', '.char .thumb', function(){
        if( isMobile() ) return false;
        clearTimeout( TO_light );
        var charid = $(this).data('charid');
        if( typeof charid === 'undefined' ) return false;
        //  
        light_box_show( $(this), 'light_char', char_info( charid, 'small' ) );
    })
    .on( 'mouseover', '.show_light_box', function(){
        if( isMobile() ) return false;
        clearTimeout( TO_light );
        var lclass = '';
        if( $(this).hasClass('light_quest') ) {
            var qid = $(this).data('qid');
            if( typeof qid === 'undefined' ) return false;
            lhtml = quest_info( qid, 'small' );
        }
        if( $(this).hasClass('light_trade') ) {
            var tid = $(this).data('tid');
            if( typeof tid === 'undefined' ) return false;
            lhtml = trade_info( tid, 'small' );
        }
        //  
        light_box_show( $(this), lclass, lhtml );
    })
    .on( 'mouseout', '.char .thumb, .show_light_box', function(){
        clearTimeout( TO_light );
        TO_light = setTimeout(function(){ $('#light_box').fadeOut(200) }, 500);
    })

    //
    $(document)
    .on('keydown', function (e) {
        var code = e.which || e.keyCode;
        //  選單
        if (e.altKey && code === 49) { return $('#lt_menu .btn1').click(); }    // alt + 1
        if (e.altKey && code === 50) { return $('#lt_menu .btn2').click(); }    // alt + 2
        if (e.altKey && code === 51) { return $('#lt_menu .btn3').click(); }    // alt + 3
        if (e.altKey && code === 52) { return $('#lt_menu .btn4').click(); }    // alt + 4
        if (e.altKey && code === 53) { return $('#lt_menu .btn5').click(); }    // alt + 5
        if (e.altKey && code === 54) { return $('#lt_menu .btn6').click(); }    // alt + 6
        if (e.altKey && code === 55) { return $('#lt_menu .btn7').click(); }    // alt + 7
        //
        if( Box_Right_Show == 1 ) {
            if( code === 49 ) { $('#city_char .h5_btn').click(); }      // 1
            if( code === 50 ) { $('#city_ship .h5_btn').click(); }      // 2
            if( code === 51 ) { $('#city_market .h5_btn').click(); }    // 3
            if( code === 52 ) { $('#city_bar .h5_btn').click(); }       // 4
            if( code === 53 ) { $('#city_quest .h5_btn').click(); }     // 5
            if( code === 54 ) { $('#city_smuggle .h5_btn').click(); }   // 6
            if( code === 55 ) { $('#city_config .h5_btn').click(); }    // 7
        }
        if (code == 27) esc_close(); // esc
        if (e.altKey && code === 83) { $('.search_btn').click();e.preventDefault(); }       // alt + s
        if (e.altKey && code === 87) { $('#wind_mon .emoji').click();e.preventDefault(); }  // alt + w
        if (e.ctrlKey && code === 70) { $('.search_btn').click();e.preventDefault(); }      // ctrl + f
    })
    .on('click', 'input', function(){ this.select() })
    .on('click', '.city .btn', function(){
        var cid = $(this).parent().data('cityid');
        if( cid == CityNow ) return $('#box_right .box_close').click();
        box_right( cid );
    })
    .on('click', '.have_tool', function(){
        var cityid = $(this).data('cityid');
        var checktime = check_tool( cityid, true );
        if( checktime > 0 ) {
            $('.tool_'+cityid).addClass('checked');
        }else{
            $('.tool_'+cityid).removeClass('checked');
        }
    })
    .on('click', '.have_bar', function(){
        var cityid = $(this).data('cityid');
        var checktime = check_bar( cityid, true );
        if( checktime > 0 ) {
            $('.bar_'+cityid).addClass('checked');
        }else{
            $('.bar_'+cityid).removeClass('checked');
        }
    })
    .on('click', '.have_wood', function(){
        var cityid = $(this).data('cityid');
        var checktime = check_wood( cityid, true );
        if( checktime > 0 ) {
            $('.ship_'+cityid).addClass('checked');
        }else{
            $('.ship_'+cityid).removeClass('checked');
        }
    })
    .on('click', '.have_be, .have_sm', function(){
        fade_box_show( $(this), 'fade_box', lang( $(this).data('l'), 'translate' ) );
    })
    .on('touchstart', '.main_scroll', function(e) {
        nowheel_over = true;
        touchstartY = e.originalEvent.touches[0].clientY;
    })
    .on('touchmove', '.main_scroll', function(e) {
        nowheel_over = true;
        touchendY = e.originalEvent.touches[0].clientY;
        touchendT = touchstartY - touchendY;
        if( touchendT < -33 ) {
            touchstartY = touchendY;
            touchendT = 0;
            $(this).animate({ scrollTop: '-=33' }, 50);
        } else if( touchendT > 33 ) {
            touchstartY = touchendY;
            touchendT = 0;
            $(this).animate({ scrollTop: '+=33' }, 50);
        }
    })
    .on('touchend', '.main_scroll', function() {
        nowheel_over = false;
        touchstartY = 0;
        touchendY = 0;
        touchendT = 0;
    })
    .on('mouseover', '.main_scroll', function(){ nowheel_over = true })
    .on('mouseout',  '.main_scroll', function(){ nowheel_over = false })
    .on('mouseout',  '.nowheel', function(){ nowheel_over = false })
    .on('DOMMouseScroll onwheel mousewheel onmousewheel wheel', '.nowheel', function(e){ nowheel_over = true; })
    .on('DOMMouseScroll onwheel mousewheel onmousewheel wheel', '.main_scroll', function(e){ nowheel_over = true; })
    .on('mouseover', '#light_box, #transicon', function(){ clearTimeout( TO_light ) })
    .on('mouseout',  '#light_box, #transicon', function(){ TO_light = setTimeout(function(){ $('#light_box').fadeOut(200);$('#city_there').fadeOut(200); }, 500) })
    .on('mouseover', '.translate', function(){ transicon( $(this) ) })
    .on('mouseout',  '.translate', function(){ TO_icon = setTimeout(function(){ $('#transicon').fadeOut(200) }, 500) })
    .on('click', '#notice', function(){ $(this).hide(); })

    $('#transicon')
        .on('mouseover', 'a, img, span', function(){ clearTimeout( TO_icon ) })
        .on('mouseout', 'a', function(){ TO_icon = setTimeout(function(){ $('#transicon').fadeOut(200) }, 500) })

    // 右鍵選單
    $(document).on('contextmenu', function(e) {
        if( !nowheel_over ) {
            e.preventDefault();
            //
            var cityid = $(e.target).parents('.city').attr('id');
            if( typeof cityid !== 'undefined' ) return context_menu( e, {'type':'city'  ,'cityid':cityid} );
            //
            //var disid  = $(e.target).parents('.discov').attr('id');
            //if( typeof disid !== 'undefined'  ) return context_menu( e, {'type':'discov','disid':disid} );
            //
            //console.log( $(e.target) );
            return context_menu( e, {'type':''} );
        }
    })
    //
    $('#city_there').click( function(){ $(this).hide(); } );
    $('#box_test').click( function(){ $(this).hide(); } );
    //  loop
    //var interval = setInterval(function(){ loop() }, 500);
    loop();
    queue( function(){ loop_animate(); } );
});


