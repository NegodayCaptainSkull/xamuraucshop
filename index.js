const express = require('express');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;

const TelegramApi = require('node-telegram-bot-api');
const admin = require('firebase-admin');
require('firebase/database');
const serviceAccount = require('/etc/secrets/serviceAccountKey.json');
const token = process.env.token;
const bot = new TelegramApi(token);

const firebaseConfig = {
  apiKey: "AIzaSyBtHCM_DxBzOc-uAzzJbgvl9uWCbr2NlTA",
  authDomain: "test-shop-c86c0.firebaseapp.com",
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://test-shop-c86c0-default-rtdb.firebaseio.com",
  projectId: "test-shop-c86c0",
  storageBucket: "test-shop-c86c0.appspot.com",
  messagingSenderId: "442194480617",
  appId: "1:442194480617:web:498da288a16a4d6d828f78"
};

admin.initializeApp(firebaseConfig);

// Получаем доступ к Realtime Database
const database = admin.database();

const URL = 'https://xamuraucshop-test.onrender.com';

bot.setWebHook(`${URL}/bot${token}`);

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200); // Отправляем успешный ответ для Telegram
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // ID группы для отправки сообщений администраторам

let admins = {};
database.ref('admins').once('value').then((snapshot) => {
  admins = snapshot.val() || {};
  // Если список администраторов пуст, добавляем первого админа
  if (!Object.keys(admins).length) {
    admins[ADMIN_CHAT_ID.toString()] = true;
    database.ref('admins').set(admins);
  }
});

function isAdmin(chatId) {
  const id = chatId.toString();
  if (admins[id] === true) {
    return true;
  }
  return false;
}

function sendMessageToAllAdmins(message, inlineKeyboard = null) {
  Object.keys(admins).forEach(adminId => {
    const options = {};

    if (inlineKeyboard) {
      options.reply_markup = {
        inline_keyboard: inlineKeyboard
      };
    }

    bot.sendMessage(adminId, message, options)
  });
}

function forwardMessageToAllAdmins(chatId, messageId) {
  // Предполагаем, что admins - это массив с ID администраторов
  Object.keys(admins).forEach(adminId => {
    bot.forwardMessage(adminId, chatId, messageId)
  });
}

database.ref('paymentDetails').once('value').then((snapshot) => {
  paymentDetails = snapshot.val() || "123456";
});

// Загрузка товаров
let products = [];

database.ref('products').once('value').then((snapshot) => {
  products = snapshot.val() || [  { label: '60', price: 88 },
    { label: '120', price: 176 },
    { label: '180', price: 264 },
    { label: '325', price: 445 },
    { label: '385', price: 520 },
    { label: '660', price: 870 },
    { label: '720', price: 910 },
    { label: '1800', price: 2150 },
    { label: '1920', price: 2300 },
    { label: '3850', price: 4100 },
    { label: '8100', price: 8200 },];
});

// Загрузка балансов пользователей
let userBalances = {};

database.ref('userBalances').once('value').then((snapshot) => {
  userBalances = snapshot.val() || {};
});

// Для ожидания суммы пополнения и отправки чека
let awaitingDeposit = {};  // Ожидание суммы для пополнения
let awaitingReceipt = {};  // Ожидание чека
let awaitingPubgId = {};   // Ожидание ввода PUBG ID от пользователя
let pendingChecks = {};    // Храним информацию о пользователях, чьи чеки ожидают подтверждения
let awaitingToChangeProduct = {};
let awaitingToChangeCredentials = {};
let awaitingUserToChangeBalance = {};
let awaitingToChangeBalance = {};
let awaitingToCreateMailing = {};
let awaitingToAddAdmin = {};
let awaitingToRemoveAdmin = {};


bot.setMyCommands();

// Главное меню с кнопками
const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Купить UC 💰' }],
      [{ text: 'Баланс 💳' }],
      [{ text: 'Реферальная система 🔗' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  },
};

const adminMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Купить UC 💰' }],
      [{ text: 'Баланс 💳' }],
      [{ text: 'Реферальная система 🔗' }],
      [{ text: 'Меню администратора ⚙️' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  },
};

const adminActionsMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Редактировать товары 🛠️' }, { text: 'Добавить товар ➕' }, { text: 'Удалить товар ➖' }],
      [{ text: 'Редактировать реквизиты 💳' }],
      [{ text: 'Редактировать баланс 💳' }],
      [{ text: 'Сделать рассылку ✉️' }],
      [{ text: 'Добавить администратора 👤' }, { text: 'Удалить администратора 🗑️' }],
      [{ text: 'Назад ↩️' }]  // Кнопка для возврата в основное меню
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

const cancelMenu = {
  reply_markup: {
    keyboard: [
      [{ text: 'Отмена' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

bot.onText(/\/start(?: (.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const referrerId = match[1];  // Получаем реферальный ID, если он есть
  const menu = isAdmin(chatId) ? adminMenu : mainMenu;

  if (userBalances[chatId] || userBalances[chatId] === 0) {
    bot.sendMessage(chatId, 'Вы уже зарегистрированы. Что вы хотите сделать?', menu)
  } else {
    if (referrerId && referrerId !== chatId.toString() && (userBalances[referrerId] || userBalances[referrerId] === 0)) {
      // Сохраняем реферала в базе данных
      database.ref(`referrals/${chatId}`).set({
        referrerId: referrerId
      });
      bot.sendMessage(referrerId, `У вас новый реферал! ID: ${chatId}`);
    }
  
    if (!userBalances[chatId]) {
      userBalances[chatId] = 0; // Устанавливаем баланс, если он не был установлен
  
      // Сохраняем нового пользователя в базе данных
      database.ref(`userBalances/${chatId}`).set(userBalances[chatId])
        .catch((error) => {
          console.error(`Error adding user to database: ${error}`);
        });
    }
  
    // Отправляем только одно приветственное сообщение
    bot.sendMessage(chatId, 'Добро пожаловать! Что вы хотите сделать?', menu);
  }
});

// Получаем тег пользователя (имя пользователя или имя)
const getUserTag = (msg) => {
  const username = msg.from.username ? `@${msg.from.username}` : `${msg.from.first_name || 'Пользователь'}`;
  return username;
};

// Обработка сообщений от пользователя
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userTag = getUserTag(msg); // Получаем тег пользователя

  const replyToMessage = msg.reply_to_message;

  // Если сообщение пришло от админа и это ответ на пересланное сообщение
  
  const menu = isAdmin(chatId) ? adminMenu : mainMenu;
  
  if (isAdmin(chatId) && replyToMessage) {
    const userId = replyToMessage.forward_from.id;

    // Пересылаем ответ админу пользователю
    bot.sendMessage(userId, `Ответ от администратора: ${msg.text}`).then(() => {
      sendMessageToAllAdmins(`Ответ от ${userTag} пользователю с ID ${userId} был отправлен.`)
    });
  }

  // Обработка отмены
  if (text === 'Отмена') {
    // Сбрасываем все ожидания
    awaitingPubgId[chatId] = false;
    awaitingDeposit[chatId] = false;
    awaitingReceipt[chatId] = false;
    awaitingDeposit[chatId] = false;
    awaitingReceipt[chatId] = false;
    awaitingPubgId[chatId] = false;
    pendingChecks[chatId] = false;
    awaitingToChangeProduct[chatId] = false;
    awaitingToChangeCredentials[chatId] = false;
    awaitingUserToChangeBalance[chatId] = false;
    awaitingToChangeBalance[chatId] = false;
    awaitingToCreateMailing[chatId] = false;
    awaitingToAddAdmin[chatId] = false;
    awaitingToRemoveAdmin[chatId] = false;
    // Возвращаем главное меню
    bot.sendMessage(chatId, 'Действие отменено. Вы вернулись в главное меню.', menu);
    return;
  }

  // Если бот ждет ID в PUBG
  if (awaitingPubgId[chatId]) {
    const pubgId = text; // Получаем ID пользователя в PUBG
    const purchaseInfo = awaitingPubgId[chatId];
    const itemPrice = purchaseInfo.price;

    // Проверяем баланс пользователя
    if (userBalances[chatId] >= itemPrice) {
      // Если достаточно средств, списываем деньги
      userBalances[chatId] -= itemPrice;

      database.ref('userBalances').set(userBalances);

      // Отправляем информацию администратору с ID PUBG и товаром
      sendMessageToAllAdmins(`Пользователь ${userTag} (ID: ${chatId}) ввел PUBG ID: ${pubgId} для товара на сумму ${itemPrice}₽. Средства списаны с баланса.`, [
        [{ text: 'Заказ выполнен', callback_data: `order_completed_${chatId}` }],
      ])

      bot.sendMessage(chatId, `Спасибо! Ваш PUBG ID: ${pubgId} был отправлен администратору. С вашего баланса списано ${itemPrice}₽. Ожидайте обработки заказа.`, menu);
    } else {
      // Если недостаточно средств, сообщаем пользователю и предлагаем пополнить баланс
      const missingAmount = itemPrice - userBalances[chatId];
      bot.sendMessage(chatId, `Недостаточно средств на балансе для покупки этого товара. Вам не хватает ${missingAmount}₽.`);
      bot.sendMessage(chatId, 'Пожалуйста, пополните баланс, чтобы продолжить покупку.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Пополнить баланс', callback_data: 'deposit' }],
          ],
          keyboard: menu.reply_markup.keyboard,
        },
      });
    }

    awaitingPubgId[chatId] = false; // Завершаем ожидание ID в PUBG
    return;
  }

  // Если бот ждет сумму для пополнения
  if (awaitingDeposit[chatId]) {
    const amount = parseFloat(text); // Преобразуем введенное значение в число

    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, 'Пожалуйста, введите корректную сумму для пополнения.');
      return;
    }

    // Сохраняем данные о пополнении для пользователя
    pendingChecks[chatId] = {
      amount: amount,
      userTag: userTag,
      userId: chatId
    };

    // Отправляем сообщение с реквизитами для перевода
    bot.sendMessage(chatId, `Отправьте деньги на следующие реквизиты:

${paymentDetails}

Сумма: ${amount}

В ОТВЕТНОМ СООБЩЕНИИ ПРИШЛИТЕ ЧЕК ТРАНЗАКЦИИ:`, cancelMenu);

    awaitingDeposit[chatId] = false;  // Завершаем ожидание суммы
    awaitingReceipt[chatId] = true;  // Начинаем ожидание чека
    return;
  }

  if (awaitingReceipt[chatId]) {
    // Пересылаем чек администратору
    forwardMessageToAllAdmins(chatId, msg.message_id)
    bot.sendMessage(chatId, 'Чек получен и отправлен администратору на проверку. Ожидайте подтверждения.', menu);
    
    // Оповещаем администратора о запросе на проверку чека
    const userInfo = pendingChecks[chatId];
    sendMessageToAllAdmins(`${userTag} (ID: ${chatId}) отправил чек для пополнения на сумму ${userInfo.amount}₽. Пожалуйста, проверьте.`, [
      [{ text: 'Подтвердить', callback_data: `confirm_${chatId}` }],
      [{ text: 'Отменить', callback_data: `reject_${chatId}` }],
    ])

    awaitingReceipt[chatId] = false;  // Завершаем ожидание чека
    return;
  }

  if (awaitingToChangeProduct[chatId]) {
    const product = awaitingToChangeProduct[chatId].product;
    const newPrice = parseFloat(msg.text);
    if (isNaN(newPrice)) {
        bot.sendMessage(chatId, 'Пожалуйста, введите корректную цену.');
        return;
    }

    // Обновляем цену товара
    product.price = newPrice;
    database.ref('products').set(products)
    .then(() => {
        bot.sendMessage(chatId, `Цена товара ${product.name}) была изменена на ${newPrice}₽.`);
    })
    .catch((error) => {
        bot.sendMessage(chatId, 'Ошибка сохранения данных в Firebase.');
        console.error(error);
    });
      awaitingToChangeProduct[chatId] = false
  }

  if (awaitingToChangeCredentials[chatId]) {
    paymentDetails = msg.text;
      database.ref('paymentDetails').set(paymentDetails)
        .then(() => {
          bot.sendMessage(chatId, `Реквизиты были успешно изменены на: ${paymentDetails}`, menu);
        })
        .catch((error) => {
          bot.sendMessage(chatId, 'Ошибка сохранения реквизитов в Firebase.', menu);
          console.error(error);
    });

    awaitingToChangeCredentials[chatId] = false;
  }

  if (awaitingUserToChangeBalance[chatId]) {
    const userId = msg.text; // Получаем ID пользователя
    
    bot.sendMessage(chatId, `Баланс пользователя ${userBalances[userId]}. Введите новую сумму для баланса:`);

    awaitingToChangeBalance[chatId] = {userId}
    awaitingUserToChangeBalance[chatId] = false
  }

  if (awaitingToChangeBalance[chatId]) {
    const newBalance = parseFloat(msg.text); // Получаем новую сумму
    const userId = awaitingToChangeBalance[chatId].userId

    if (isNaN(newBalance)) {
      bot.sendMessage(chatId, 'Пожалуйста, введите корректную сумму.', menu);
      return;
    }

    if (userBalances[userId] || userBalances[userId] === 0) {
      userBalances[userId] = newBalance; // Обновляем баланс пользователя
      database.ref('userBalances').set(userBalances)
        .then(() => {
          bot.sendMessage(chatId, `Баланс пользователя с ID ${userId} был изменен на ${newBalance}₽.`, menu);
        })
        .catch((error) => {
          bot.sendMessage(chatId, 'Ошибка сохранения данных в Firebase.', menu);
          console.error(error);
        });
    } else {
      bot.sendMessage(chatId, 'Пользователя с таким id нет.', menu)
    }

    awaitingToChangeBalance[chatId] = false
  } 

  if (awaitingToCreateMailing[chatId]) {
    const broadcastMessage = msg.text;
    if (msg.text === 'Отмена') {
      return;
    }
    if (!broadcastMessage) {
      return bot.sendMessage(chatId, 'Сообщение не может быть пустым.');
    }

    // Получаем всех пользователей из базы данных
    database.ref('userBalances').once('value', async (snapshot) => {
      const users = snapshot.val();
      
      if (!users) {
        return bot.sendMessage(chatId, 'Нет пользователей для рассылки.');
      }

      // Разослать сообщение каждому пользователю
      const userIds = Object.keys(users);
      for (const userId of userIds) {
        try {
          await bot.sendMessage(userId, broadcastMessage);
        } catch (error) {
          // Если ошибка связана с превышением лимита запросов, обрабатываем её
          if (error.response && error.response.statusCode === 429) {
            const retryAfter = error.response.body.parameters.retry_after || 1;
            console.log(`Превышен лимит запросов, повтор через ${retryAfter} секунд...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          }
        }
    
        // Добавляем задержку между сообщениями, чтобы не превысить лимит Telegram
        await new Promise(resolve => setTimeout(resolve, 1000)); // Задержка 1 секунда
      }

      bot.sendMessage(chatId, `Сообщение успешно отправлено ${userIds.length} пользователям.`, menu);
    });

    awaitingToCreateMailing[chatId] = false;
  }

  if (awaitingToAddAdmin[chatId]) {
    const newAdminId = msg.text;
    if (!admins[newAdminId]) {
      // Добавляем нового администратора в список
      admins[newAdminId] = true;
      database.ref('admins').set(admins)
        .then(() => {
          bot.sendMessage(chatId, `Пользователь с ID ${newAdminId} добавлен как администратор.`, menu);
          bot.sendMessage(newAdminId, 'Вы были добавлены в качестве администратора.');
        })
        .catch((error) => {
          bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
        });
    } else {
      bot.sendMessage(chatId, `Пользователь с ID ${newAdminId} уже является администратором.`, menu);
    }

    awaitingToAddAdmin[chatId] = false;
  }

  if (awaitingToRemoveAdmin[chatId]) {
    const adminIdToRemove = msg.text;
          
    // Проверяем, что этот пользователь действительно является администратором
    if (admins[adminIdToRemove]) {
      if (adminIdToRemove === ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, 'Нельзя удалить главного администратора', menu);
      } else {
        // Удаляем администратора из списка
        delete admins[adminIdToRemove];
        database.ref('admins').set(admins)
            .then(() => {
                bot.sendMessage(chatId, `Пользователь с ID ${adminIdToRemove} был удален из списка администраторов.`, menu);
                bot.sendMessage(adminIdToRemove, 'Вы были удалены из списка администраторов.');
            })
            .catch((error) => {
                bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
            });
      }
    } else {
        bot.sendMessage(chatId, `Пользователь с ID ${adminIdToRemove} не является администратором.`, menu);
    }

    awaitingToRemoveAdmin[chatId] = false;
  }

  // Обычные команды
  if (text === 'Баланс 💳') {
    const balance = userBalances[chatId];
    bot.sendMessage(chatId, `Ваш текущий баланс: ${balance}₽`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Пополнить баланс', callback_data: 'deposit' }],
        ],
      },
    });
  } else if (text === 'Купить UC 💰') {
    const keyboard = [];
    for (let i = 0; i < products.length; i += 2) {
      const row = products.slice(i, i + 2).map(item => ({
        text: `${item.label} UC - ${item.price}₽`,
        callback_data: `buy_${item.label}_${item.price}`,
      }));
      keyboard.push(row);
    }
    bot.sendMessage(chatId, '🛒 Выберите товар:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } else if (text === 'Реферальная система 🔗') {
    const referralLink = `https://t.me/XaMuRaSHOP_bot?start=${chatId}`;

    bot.sendMessage(chatId, `Ваша реферальная ссылка: ${referralLink}. Пригласите друзей и получайте бонусы за их покупки!`);
  } else if (text === 'Меню администратора ⚙️') {
    if (!isAdmin(chatId)) {
      return; 
    }
    bot.sendMessage(chatId, 'Выберите действие:', adminActionsMenu);
  } else if (text === 'Назад ↩️') {
    if (!isAdmin(chatId)) {
      return; 
    }
    bot.sendMessage(chatId, 'Вы вернулись в главное меню:', adminMenu);
  } else if (text === 'Редактировать товары 🛠️') {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return; 
    }

    // Создаем инлайн-клавиатуру с кнопками для каждого товара
    const productButtons = products.map(product => ({
      text: `${product.label} UC - ${product.price}₽`,  // Отображаем метку и имя товара
      callback_data: `edit_product_${product.label}`  // Уникальный callback_data для каждого товара
    }));

    // Разбиваем кнопки на строки по 2 кнопки в каждой строке
    const keyboard = [];
    for (let i = 0; i < productButtons.length; i += 2) {
      keyboard.push(productButtons.slice(i, i + 2));
    }

    bot.sendMessage(chatId, 'Выберите товар, который хотите изменить:', {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } else if (text === 'Редактировать реквизиты 💳') {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return; 
    }
  
    bot.sendMessage(chatId, 'Введите новые реквизиты для пополнения:', cancelMenu);

    awaitingToChangeCredentials[chatId] = true;
  } else if (text === 'Редактировать баланс 💳') {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return; 
    }
  
    bot.sendMessage(chatId, 'Введите ID пользователя, чей баланс вы хотите изменить:', cancelMenu);

    awaitingUserToChangeBalance[chatId] = true;
  }  else if (text === 'Сделать рассылку ✉️') {
    // Проверяем, что пользователь является администратором
    if (!isAdmin(chatId)) {
      return; 
    }
  
    bot.sendMessage(chatId, 'Отправьте текст сообщения, которое хотите разослать всем пользователям:', cancelMenu);
    
    awaitingToCreateMailing[chatId] = true;
  } else if (text === 'Добавить администратора 👤') {
    if (isAdmin(chatId)) {
      bot.sendMessage(chatId, 'Введить Id пользователя, которого хотите сделать администратором: ', cancelMenu)
      
      awaitingToAddAdmin[chatId] = true;
    }
  } else if (text === 'Удалить администратора 🗑️') {
    if (isAdmin(chatId)) {
      bot.sendMessage(chatId, 'Введите ID администратора, которого хотите удалить: ', cancelMenu);
      
      awaitingToRemoveAdmin[chatId] = true;
    }
  }
});

// Обработка нажатий на inline-кнопки
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (userBalances[chatId] === undefined) {
    userBalances[chatId] = 0;  // Устанавливаем начальный баланс для новых пользователей
  }

  // Проверяем нажатие на кнопки администратора
  if (data.startsWith('confirm_')) {
    const userId = data.split('_')[1];
    const userInfo = pendingChecks[userId];

    if (!isAdmin(query.from.id)) {
      return
    }

    if (userInfo) {
      const depositAmount = userInfo.amount;

      // Обновляем баланс пользователя
      userBalances[userId] = (userBalances[userId] || 0) + depositAmount;

      database.ref('userBalances').set(userBalances);

      // Проверяем, есть ли у этого пользователя реферера
      database.ref(`referrals/${userId}`).once('value', (snapshot) => {
        if (snapshot.exists()) {
          const referralData = snapshot.val();
          const referrerId = referralData[Object.keys(referralData)[0]];  // Получаем ID реферера
          const bonus = depositAmount * 0.005;  // 0.5% бонус

          // Начисляем бонус рефереру
          userBalances[referrerId] = (userBalances[referrerId] || 0) + bonus;
          database.ref('userBalances').set(userBalances);

          // Сообщаем рефереру о бонусе
          bot.sendMessage(referrerId, `Ваш реферал пополнил баланс на ${depositAmount}₽. Вам начислено ${bonus}₽ в качестве бонуса.`);
        }
      });

      // Оповещаем администратора и пользователя
      sendMessageToAllAdmins(`Пополнение на ${depositAmount}₽ для ${userInfo.userTag} (ID: ${userId}) подтверждено.`);
      bot.sendMessage(userId, `Ваш баланс был пополнен на ${depositAmount}₽. Текущий баланс: ${userBalances[userId]}₽.`);

      // Очищаем информацию о запросе
      delete pendingChecks[userId];
    }
  } else if (data.startsWith('reject_')) {
    const userId = data.split('_')[1];
    const userInfo = pendingChecks[userId];

    if (!isAdmin(query.from.id)) {
      return
    }

    if (userInfo) {
      // Оповещаем администратора и пользователя об отмене
      sendMessageToAllAdmins(`Пополнение на ${userInfo.amount}₽ для ${userInfo.userTag} (ID: ${userId}) отменено.`);
      bot.sendMessage(userId, `Ваше пополнение на сумму ${userInfo.amount}₽ было отклонено. Пожалуйста, попробуйте снова.`);

      // Очищаем информацию о запросе
      delete pendingChecks[userId];
    }
  } else if (data.startsWith('buy_')) {
    const [_, label, price] = data.split('_');; // Получаем метку товара (например, 60)
    const numericPrice = Number(price);
    
    // Запросить у пользователя его ID в PUBG
    bot.sendMessage(chatId, `Вы выбрали товар: ${label}UC за ${numericPrice}₽. Пожалуйста, введите ваш ID в PUBG:`, cancelMenu);
    
    // Сохраняем информацию о покупке и ожидаем ввода PUBG ID
    awaitingPubgId[chatId] = { label, price: numericPrice }; // Пример логики цены
    awaitingDeposit[chatId] = false; // Остановить ожидание депозита, если оно было активным
  } else if (data.startsWith('order_completed_')) {
    const userId = data.split('_')[2]; // Получаем ID покупателя из callback_data
    const message = query.message;

    if (!isAdmin(query.from.id)) {
      return
    }

    // Сообщаем администратору о выполнении заказа
    sendMessageToAllAdmins(`Заказ для пользователя с ID ${userId} был выполнен.`);

    // Сообщаем покупателю, что его заказ выполнен
    bot.sendMessage(userId, 'Ваш заказ был выполнен! Спасибо за покупку. Пожалуйста, напишите отзыв в группе и помогите улучшить качество работы. https://t.me/+Q6biAiRMhNszZGUy');

    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: message.chat.id,
      message_id: message.message_id,
    });

    return;
  } else if (data.startsWith('edit_product_')) {
      const label = data.replace('edit_product_', '');

      // Проверка наличия товара
      const product = products.find(p => p.label === label);
      if (!product) {
          bot.sendMessage(chatId, `Товар с меткой ${label} не найден.`);
          return;
      }

      bot.sendMessage(chatId, `Введите новую цену для товара ${label} UC:`, cancelMenu);

      awaitingToChangeProduct[chatId] = {product}
  } else if (data === 'deposit') {
    // Бот запрашивает сумму для пополнения
    bot.sendMessage(chatId, 'Введите сумму, на которую вы хотите пополнить баланс:', cancelMenu);
    awaitingDeposit[chatId] = true;  // Ожидание суммы для пополнения
  }
});

// Запуск бота
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});