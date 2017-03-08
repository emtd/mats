/**
 * Created by mat on 17-1-7.
 */
var plugin={}
plugin.dateToStr=function(date,split){
  if(date==null||date.constructor!=Date){
    date=new Date();
  }
  split=split==null?'':split;
  var year=date.getFullYear().toString();
  var month=(date.getMonth()+1).toString();
  var day=date.getDate().toString();
  //console.log(year,month,day)
  return year+split+(month.length==1?('0'+month):month)+split+(day.length==1?('0'+day):day)
  /*if(!date){
    return ''
  }
  var obj={}
  switch(data.constructor){
    case String:
      obj=new Date(date)
      break;
    case Number:
      obj=new Date(date)
      break;
    case Date:
      break;
    default:
      break;
  }  */
}

plugin.timeToStr=function(date,split){
  if(date==null||date.constructor!=Date){
    date=new Date();
  }
  split=split==null?'':split;
  var hours=date.getHours().toString();
  var min=(date.getMinutes()).toString();
  var sec=date.getSeconds().toString();
  return (hours.length==1?('0'+hours):hours)+split+(min.length==1?('0'+min):min)+split+(sec.length==1?('0'+sec):sec)
}

plugin.datetimeToStr=function(date,sp1,sp2,sp3){
  if(date==null||date.constructor!=Date){
    date=new Date();
  }
  sp1=sp1==null?'':sp1;
  sp2=sp2==null?'':sp2;
  sp3=sp3==null?'':sp3;

  return plugin.dateToStr(date,sp1)+sp2+plugin.timeToStr(date,sp3)
}

module.exports=plugin;

/*Date.now()//返回的是毫秒数,类型为Number
Date()//返回的是string
new Date()//返回的是object*/