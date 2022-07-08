import Base58 from 'bs58'
import { MessageEmbed, } from 'discord.js'

import {
  COMMAND_PREFIX,
  TIP_DESC_LIMIT,
  EXPECTED_ROLES,
} from '../config/index.js'

const dangerColor = '#d93f71';
const infoColor = '#0099ff';

export const AUTOHIDE = {
  min:     10_000,
  default: 40_000,
  max:     100_000,

  toString: _ => AUTOHIDE.default,
}

const string2Uint8Array = async (str) => {
  var decodedString;
  try {
    decodedString = Base58.decode(str);
    return Array.from( decodedString );
  } catch( error ) {
    return [];
  }
}

const Uint8Array2String = async (arr) => {
  try {
    const buffer = Buffer.from(arr);
    return Base58.encode(buffer);
  } catch( error ) {
    return '';
  }
}

const validateForTipping = async (args, desc) => {
  // validate the default parameter. Default tip<type> @user <amount>
  if (args.length < 2) {
    return {
      status: false,
      msg: `Invalid format\n${COMMAND_PREFIX}tip<type> @user1 @user2 ... <amount> -m <description>`,
    };
  }

  let userIds = args.slice(0, args.length - 1);
  let amount = Number(args.slice(-1));

  let recipientIds = [];
  // validate the discord users:
  for( const id of userIds ) {
    const matched = (/<@!?(\d+)>/).exec(id); // detect the discord user id
    if( !matched ) {
      return {
        status: false,
        msg: `Invalid format\n${COMMAND_PREFIX}tip<type> @user1 @user2 ... <amount> -m <description>`,
      };
    }
    recipientIds.push( matched[1] );
  }

  // validate the number of users
  if( recipientIds.length >= 4 ) {
    return {
      status: false,
      msg: `Please input less than 4 users`,
    };
  }

  // validate the desc length
  if( desc.length > TIP_DESC_LIMIT ) {
    return {
      status: false,
      msg: `Description limit ${TIP_DESC_LIMIT}`,
    };
  }

  // validate the amount
  if( isNaN(amount) || amount <= 0 ) {
    return {
      status: false,
      msg: `Invalid Amount\n${COMMAND_PREFIX}tip<type> @user1 @user2 ... <amount> -m <description>`,
    };
  }

  return {
    status: true,
    ids: recipientIds,
    amount: amount,
    msg: ``,
  };
}

const validateForRaining = async (args) => {
  // validate the default parameter. Default rain<type> <amount> <max people>
  if( args.length < 2 ) {
    return {
      status: false,
      msg: `Invalid format\n${COMMAND_PREFIX}rain<type> <amount> <max people>`,
    };
  }

  const amount = args[0];
  const maxPeople = args[1];

  // validate the amount
  if( isNaN(amount) || amount <= 0 ) {
    return {
      status: false,
      msg: `Invalid Amount\n${COMMAND_PREFIX}rain<type> <amount> <max people>`,
    };
  }

  // validate the number of people
  if( isNaN(maxPeople) || maxPeople <= 0 ) {
    return {
      status: false,
      msg: `Invalid number of people\n${COMMAND_PREFIX}rain<type> <amount> <max people>`,
    };
  }

  return {
    status: true,
    amount: amount,
    maxPeople: Math.floor(maxPeople),
  };
}

const checkRoleInPublic = async (message) => {

  let satisfiedCount = 0;
  for( const _role of EXPECTED_ROLES ) {
    const role = guild.roles.cache.find( role => role.name == _role );

    if( role && message.member.roles.cache.has(role.id) ) {
      satisfiedCount++;
    }
  }

  return (satisfiedCount == EXPECTED_ROLES.length);
}

const checkRoleInPrivate = async (guild, message) => {
  if( !guild ) {
    return false;
  }

  let satisfiedCount = 0;
  for( const _role of EXPECTED_ROLES ) {
    const role = guild.roles.cache.find( role => role.name == _role );

    const member = await guild.members.fetch( message.author.id )

    if( role && member.roles.cache.has(role.id) ) { //!!!! why fetch here but not do it in checkRoleInPublic ?
      satisfiedCount++;
    }
  }

  return satisfiedCount == EXPECTED_ROLES.length;
}

let   timer = 0,
      delete_queue = []

function fn_Deleter() {
  if( delete_queue.length ) {
    let empty = 0,
        now = Date.now()
    for( const i of Object.keys(delete_queue) ) {
      const item = delete_queue[i]
      if( !item ) {
        empty++
      } else if( now >= item.stamp ) {
        delete delete_queue[i]
        item.message.channel.messages.fetch( item.message.id )
          .then( msg => msg.delete() )
          .catch( error => console.log(`Cannot delete the message.\n${error}\nstack: ${error.stack}`) )
      }
    }
    if( empty > 50 ) { // since delete_queue is long lived we need to be more careful with the cleaning up
      delete_queue = delete_queue.filter( _ => !!_ )
    }
  }
}

export const discord = {
  // Internal helpers
  link( id ) {
    if( typeof id !== 'string' && typeof id !== 'number' ) {
      console.assert( !!id )
      console.assert( typeof id === 'object' )
      id = id.id
    }
    return `<@!${ String(id) }>`;
  },
  embed( params = {} ) {
    const { type, author,
            color,
            title, description, fields, footer,
            url, image, thumbnail, video,
          } = params

    return { type, author,
             color,
             title, description, fields, footer,
             url, image, thumbnail, video, };
  },
  // kind: embed/
  // autoHide: true or amount of ms before message dissapears
  // files to attach
  async action( fn, target, options = {} ) {
      console.assert( !!target, 'Missing or invalid target' )
      console.assert( typeof target === 'object' )
      console.assert( typeof fn === 'string', 'Missing or invalid fn' )

      let { kind, files, text, autoHide, ...msg } = options
      kind = kind || 'embed'

      if( typeof msg === 'array' ) { // TODO: support multiple messages at once
        for( item of msg ) {
          discord.action( fn, target, { kind, ...item } )
        }
      } else {
        msg.color = msg.color ?? infoColor

        if( typeof msg.timestamp === 'boolean') {
          msg.timestamp = msg.timestamp ? Date.now() : null
        }

        if( typeof msg.thumbnail === 'string') {
          msg.thumbnail = { url: msg.thumbnail, }
        }

        if( typeof msg.image === 'string') {
          msg.image = { url: msg.image, }
        }

        if( typeof msg.video === 'string') {
          msg.video = { url: msg.video, }
        }

        switch( kind ) {
          case 'embed': msg = { embeds: [new MessageEmbed(msg)], files, }; break;
          default: {
            console.warn( error, `Unexpected message kind` )
          }
        }
        // console.log(JSON.stringify(msg));
        const result = await target[fn]( msg )
          .catch( error => {
            console.log( error, `Could not execute ${fn} on ${ String(target) }` )
          } )

        if( autoHide ) {
          if( typeof autoHide !== 'number' ) {
            autoHide = AUTOHIDE.default
          }
          setTimeout( _ => result.delete(), autoHide )
        }
        // console.log('Result:', result);
        return result;
      }
  },

  async error( to, options = {} ) {
    console.assert( typeof to?.send === 'function' )
    // TODO maybe regex check .text for details to remove? like wallets, callstacks, etc?
    return await discord.action( 'send', to, {...options, color: dangerColor, title: 'Error', autoHide: true,} )
  },
  async send( to, options = {} ) {
    console.assert( typeof to?.send === 'function' )
    return await discord.action( 'send', to, options )
  },
  async edit( target, options = {} ) {
    // assert( target instanceof MessageEmbed )
    console.assert( typeof target?.edit === 'function' )
    return await discord.action( 'edit', target, options )
  },

  deleteMessage( message, ms ) {
    delete_queue.push( { message, stamp: Date.now() + ms, } )
    if( !timer ) {
      timer = setInterval( fn_Deleter, 5_000 )
    }
  },

}

export function removeItem( array, item ) {
  const idx = array.findIndex( elem => elem === item )
    console.assert( idx >= 0, 'Item not in the array' )

  array.splice( idx, 1 )
}

export function secondsToHMS( totalSeconds ) { // TODO use a standar library instead

  let days = Math.floor( totalSeconds / 86400 ); // 60*60*24
  totalSeconds %= 86400;
  let hours = Math.floor( totalSeconds / 3600 );
  totalSeconds %= 3600;
  let minutes = Math.floor( totalSeconds / 60 );
  let seconds = Math.floor( totalSeconds % 60 );
  
  return `${days} days, ${hours} hours, ${minutes} minutes and ${seconds} seconds`;
}

export default {
  string2Uint8Array,
  Uint8Array2String,

  validateForTipping,
  validateForRaining,

  checkRoleInPublic,
  checkRoleInPrivate,

  removeItem,

  discord,
  embed: discord.embed,
  send: discord.send,
  edit: discord.edit,
}